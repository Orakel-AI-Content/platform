import { execFile } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { EXIT_CODES, RollbackResultSchema, exitCodeOf } from '@orakel/build-contract';
import type { RollbackEnv } from './env.ts';
import { ClassifiedError } from './failures.ts';
import { rollbackCloudflare } from './publish/cloudflare.ts';
import { rollbackEdgeLocal } from './publish/edge-local.ts';
import { rollback, type RollbackDeps } from './rollback.ts';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir() {
  const dir = await mkdtemp(join(tmpdir(), 'rollback-'));
  dirs.push(dir);
  return dir;
}

const VERSION = '20260930T210249Z-4032e8d6';
const TOKEN = 't'.repeat(40);
const ACCOUNT = 'a'.repeat(32);

async function readRollback(dir: string) {
  return RollbackResultSchema.parse(JSON.parse(await readFile(join(dir, 'rollback.json'), 'utf8')));
}

/** Servidor HTTP real no papel do edge-local: responde `status`/`body` e guarda os pedidos. */
async function edgeLocal(status: number, body: (id: unknown) => string) {
  const requests: { method?: string; url?: string; type?: string; body: string }[] = [];
  const srv = createServer((req, res) => {
    let text = '';
    req.on('data', (chunk: Buffer) => (text += chunk.toString('utf8')));
    req.on('end', () => {
      requests.push({
        method: req.method,
        url: req.url,
        type: req.headers['content-type'],
        body: text,
      });
      const id = text ? (JSON.parse(text) as { id?: unknown }).id : undefined;
      res.writeHead(status, { 'content-type': 'application/json' }).end(body(id));
    });
  }).listen(0, '127.0.0.1');
  await new Promise((resolve) => srv.once('listening', resolve));
  return {
    url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}`,
    requests,
    close: () => new Promise((resolve) => srv.close(resolve)),
  };
}

/**
 * wrangler simulado: grava argv e as credenciais recebidas pelo env num arquivo e sai com o
 * código e o stderr pedidos.
 */
async function fakeWrangler(exitCode = 0, stderr = '') {
  const dir = await tempDir();
  const bin = join(dir, 'wrangler');
  const record = join(dir, 'call.json');
  const script = `#!/usr/bin/env node
const { writeFileSync } = require('node:fs');
writeFileSync(${JSON.stringify(record)}, JSON.stringify({
  argv: process.argv.slice(2),
  token: process.env.CLOUDFLARE_API_TOKEN,
  account: process.env.CLOUDFLARE_ACCOUNT_ID,
}));
process.stderr.write(${JSON.stringify(stderr)});
process.exit(${exitCode});
`;
  await writeFile(bin, script);
  await chmod(bin, 0o755);
  return {
    bin,
    call: async () =>
      JSON.parse(await readFile(record, 'utf8')) as {
        argv: string[];
        token?: string;
        account?: string;
      },
  };
}

describe('rollbackCloudflare (wrangler simulado)', () => {
  it('chama wrangler rollback com a versão, o Worker do site e o token só pelo env', async () => {
    const w = await fakeWrangler();
    const credentials = { apiToken: TOKEN, accountId: ACCOUNT };
    expect(await rollbackCloudflare('exemplo-a', VERSION, credentials, w.bin)).toBe(VERSION);
    const call = await w.call();
    expect(call.argv.slice(0, 4)).toEqual(['rollback', VERSION, '--name', 'orakel-exemplo-a']);
    expect(call.argv).toContain('--yes');
    expect(call.argv).toContain('--message');
    expect(call.argv.join(' ')).not.toContain(TOKEN);
    expect(call).toMatchObject({ token: TOKEN, account: ACCOUNT });
  });

  it('autenticação é permanente; outra falha, transitória', async () => {
    const credentials = { apiToken: TOKEN, accountId: ACCOUNT };
    const auth = await fakeWrangler(1, 'Authentication error [code: 10000]');
    await expect(
      rollbackCloudflare('exemplo-a', VERSION, credentials, auth.bin),
    ).rejects.toMatchObject({ kind: 'permanent' });
    const other = await fakeWrangler(1, 'fetch failed');
    const error: unknown = await rollbackCloudflare(
      'exemplo-a',
      VERSION,
      credentials,
      other.bin,
    ).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ClassifiedError);
    expect(error).toMatchObject({ kind: 'transient' });
    expect((error as ClassifiedError).message).toContain('fetch failed');
  });
});

describe('rollbackEdgeLocal', () => {
  it('POST /sites/{site}/rollback com o id; devolve a versão ativa', async () => {
    const s = await edgeLocal(200, (id) => JSON.stringify({ active: id }));
    try {
      expect(await rollbackEdgeLocal(`${s.url}/`, 'exemplo-a', VERSION)).toBe(VERSION);
      expect(s.requests).toEqual([
        {
          method: 'POST',
          url: '/sites/exemplo-a/rollback',
          type: 'application/json',
          body: JSON.stringify({ id: VERSION }),
        },
      ]);
    } finally {
      await s.close();
    }
  });

  it('404 e 400 são permanentes; 503, rede e versão ativa diferente, transitórias', async () => {
    for (const [status, body, kind] of [
      [404, '{"error":"Versão não encontrada"}', 'permanent'],
      [400, '{"error":"JSON inválido"}', 'permanent'],
      [503, '{"error":"x"}', 'transient'],
      [200, '{"active":"outra"}', 'transient'],
      [200, '{}', 'transient'],
    ] as const) {
      const s = await edgeLocal(status, () => body);
      await expect(rollbackEdgeLocal(s.url, 'exemplo-a', VERSION)).rejects.toMatchObject({
        kind,
      });
      await s.close();
    }
    await expect(
      rollbackEdgeLocal('http://127.0.0.1:9', 'exemplo-a', VERSION),
    ).rejects.toMatchObject({ kind: 'transient' });
  });
});

describe('rollback', () => {
  function fakes(overrides: Partial<RollbackDeps> = {}): RollbackDeps {
    return {
      rollbackCloudflare: vi.fn((_site: string, id: string) => Promise.resolve(id)),
      rollbackEdgeLocal: vi.fn((_url: string, _site: string, id: string) => Promise.resolve(id)),
      now: () => 0,
      ...overrides,
    };
  }

  it('local: ativa no edge-local e grava rollback.json com a versão ativa', async () => {
    const dir = await tempDir();
    const d = fakes();
    const env: RollbackEnv = {
      SITE_ID: 'exemplo-a',
      VERSION_ID: VERSION,
      BUILD_DIR: dir,
      DEPLOY_TARGET: 'local',
      EDGE_LOCAL_URL: 'http://edge',
    };
    const result = await rollback(env, d);
    expect(d.rollbackEdgeLocal).toHaveBeenCalledWith('http://edge', 'exemplo-a', VERSION);
    expect(result).toMatchObject({ status: 'ok', target: 'local', versionId: VERSION });
    expect(await readRollback(dir)).toEqual(result);
    expect(exitCodeOf(result)).toBe(EXIT_CODES.ok);
  });

  it('cloudflare: credenciais para o wrangler', async () => {
    const dir = await tempDir();
    const d = fakes();
    const env: RollbackEnv = {
      SITE_ID: 'exemplo-a',
      VERSION_ID: VERSION,
      BUILD_DIR: dir,
      DEPLOY_TARGET: 'cloudflare',
      CLOUDFLARE_API_TOKEN: TOKEN,
      CLOUDFLARE_ACCOUNT_ID: ACCOUNT,
    };
    expect(await rollback(env, d)).toMatchObject({ status: 'ok', target: 'cloudflare' });
    expect(d.rollbackCloudflare).toHaveBeenCalledWith('exemplo-a', VERSION, {
      apiToken: TOKEN,
      accountId: ACCOUNT,
    });
  });

  it('falha classificada vai para o arquivo e para o código de saída', async () => {
    for (const kind of ['permanent', 'transient'] as const) {
      const dir = await tempDir();
      const d = fakes({
        rollbackEdgeLocal: () => Promise.reject(Object.assign(new Error('não deu'), { kind })),
      });
      const result = await rollback(
        {
          SITE_ID: 'exemplo-a',
          VERSION_ID: VERSION,
          BUILD_DIR: dir,
          DEPLOY_TARGET: 'local',
          EDGE_LOCAL_URL: 'http://edge',
        },
        d,
      );
      expect(await readRollback(dir)).toEqual({
        formatVersion: 1,
        status: 'failed',
        site: 'exemplo-a',
        failure: { kind, message: 'não deu' },
        durationMs: 0,
      });
      expect(exitCodeOf(result)).toBe(EXIT_CODES[kind]);
    }
  });
});

// Cada caso sobe a CLI num processo Node novo (até dois por caso): no runner do CI, passa dos
// 5 s padrão do Vitest.
describe('cli rollback', { timeout: 30_000 }, () => {
  const cli = fileURLToPath(new URL('./cli.ts', import.meta.url));
  const run = (env: Record<string, string>, args = ['rollback']) =>
    promisify(execFile)(process.execPath, [cli, ...args], {
      env: { PATH: process.env.PATH ?? '', ...env },
    }).then(
      ({ stdout, stderr }) => ({ code: 0, stdout, stderr }),
      (error: { code: number; stdout: string; stderr: string }) => error,
    );

  it('local: 0 e rollback.json ok contra o edge-local', async () => {
    const dir = await tempDir();
    const s = await edgeLocal(200, (id) => JSON.stringify({ active: id }));
    try {
      const out = await run({
        SITE_ID: 'exemplo-a',
        VERSION_ID: VERSION,
        BUILD_DIR: dir,
        DEPLOY_TARGET: 'local',
        EDGE_LOCAL_URL: s.url,
      });
      expect(out.code).toBe(0);
      expect(await readRollback(dir)).toMatchObject({ status: 'ok', versionId: VERSION });
    } finally {
      await s.close();
    }
  });

  it('local: 404 do edge-local sai 10; edge-local fora do ar sai 20', async () => {
    const dir = await tempDir();
    const s = await edgeLocal(404, () => '{"error":"Versão não encontrada"}');
    const env = {
      SITE_ID: 'exemplo-a',
      VERSION_ID: VERSION,
      BUILD_DIR: dir,
      DEPLOY_TARGET: 'local',
    };
    try {
      expect((await run({ ...env, EDGE_LOCAL_URL: s.url })).code).toBe(EXIT_CODES.permanent);
      expect(await readRollback(dir)).toMatchObject({ failure: { kind: 'permanent' } });
    } finally {
      await s.close();
    }
    expect((await run({ ...env, EDGE_LOCAL_URL: 'http://127.0.0.1:9' })).code).toBe(
      EXIT_CODES.transient,
    );
    expect(await readRollback(dir)).toMatchObject({ failure: { kind: 'transient' } });
  });

  it('env inválido sai 10, grava a falha e não mostra o token', async () => {
    const dir = await tempDir();
    const out = await run({
      SITE_ID: 'exemplo-a',
      BUILD_DIR: dir,
      DEPLOY_TARGET: 'cloudflare',
      CLOUDFLARE_API_TOKEN: 'segredo-curto',
    });
    expect(out.code).toBe(EXIT_CODES.permanent);
    expect(out.stdout + out.stderr).not.toContain('segredo-curto');
    const result = await readRollback(dir);
    expect(result).toMatchObject({ status: 'failed', failure: { kind: 'permanent' } });
    expect(JSON.stringify(result)).not.toContain('segredo-curto');
  });

  it('sem comando, o uso lista o rollback', async () => {
    const out = await run({}, []);
    expect(out.code).toBe(2);
    expect(out.stderr).toContain('<render|publish|rollback|ssr>');
  });
});
