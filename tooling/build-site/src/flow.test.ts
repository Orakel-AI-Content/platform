import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { PublishResultSchema, ResultSchema } from '@orakel/build-contract';
import type { PublishEnv, RenderEnv } from './env.ts';
import { WORKER_BASE_CONFIG } from './paths.ts';
import { uploadEdgeLocal } from './publish/edge-local.ts';
import { publish, type PublishDeps } from './publish/publish.ts';
import { render, type BuildSite } from './render/render.ts';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function buildDir() {
  const dir = await mkdtemp(join(tmpdir(), 'build-'));
  dirs.push(dir);
  return dir;
}

const meta = {
  header: { type: 'header', schemaVersion: 1, site: 'exemplo-a', pendingChangeIds: [3, 4] },
  end: { type: 'end', counts: {} },
  redirectUsage: { static: 1, dynamic: 0, limits: { static: 2000, dynamic: 100 }, alert: false },
};

/** Build falso: grava duas páginas e a 404 e o metaFile, como o blog. */
const fakeBuild: BuildSite = async ({ outDir, env }) => {
  await mkdir(join(outDir, 'a'), { recursive: true });
  for (const file of ['index.html', '404.html', 'a/index.html'])
    await writeFile(join(outDir, file), '');
  await writeFile(env.SNAPSHOT_META_FILE!, JSON.stringify(meta));
};

function renderEnv(dir: string, extra: Partial<RenderEnv> = {}): RenderEnv {
  return {
    SITE_ID: 'exemplo-a',
    SITE_DOMAIN: 'exemplo-a.com.br',
    EXPORT_API_URL: 'http://api',
    EXPORT_BUILD_TOKEN: 'x'.repeat(32),
    RELEASE: '1.2.3',
    ACTIVE_PAGE_COUNT: undefined,
    PAGE_DROP_TOLERANCE: 0.2,
    ALLOW_MASS_UNPUBLISH: 'false',
    BUILD_DIR: dir,
    ...extra,
  };
}

const deps = (buildSite: BuildSite) => ({
  buildSite,
  baseConfigText: () => readFile(WORKER_BASE_CONFIG, 'utf8'),
  workerMain: '/app/apps/blog/worker/src/index.ts',
  now: (() => {
    let t = 1_000;
    return () => (t += 50);
  })(),
});

describe('render', () => {
  it('passa o ambiente do blog, conta, gera os alvos e escreve result.json', async () => {
    const dir = await buildDir();
    const build = vi.fn(fakeBuild);
    const result = await render(renderEnv(dir), deps(build));
    expect(build.mock.calls[0]![0].env).toMatchObject({
      SITE_ID: 'exemplo-a',
      CONTENT_SOURCE: 'api',
    });
    expect(result).toMatchObject({
      status: 'ok',
      release: '1.2.3',
      pages: 2,
      files: 3,
      pendingChangeIds: [3, 4],
      durationMs: 50,
    });
    expect(
      ResultSchema.parse(JSON.parse(await readFile(join(dir, 'result.json'), 'utf8'))),
    ).toEqual(result);
    expect(await readFile(join(dir, 'wrangler.cloudflare.jsonc'), 'utf8')).toContain(
      '"custom_domain": true',
    );
  });

  it('falha do build vira result.json com a classificação do erro', async () => {
    const dir = await buildDir();
    const failing: BuildSite = () =>
      Promise.reject(
        new Error('hook', { cause: Object.assign(new Error('tema x'), { kind: 'permanent' }) }),
      );
    const result = await render(renderEnv(dir), deps(failing));
    expect(result).toMatchObject({
      status: 'failed',
      failure: { kind: 'permanent', message: 'tema x' },
    });
    expect(
      (JSON.parse(await readFile(join(dir, 'result.json'), 'utf8')) as { status: string }).status,
    ).toBe('failed');
  });

  it('a trava de segurança barra depois do build', async () => {
    const dir = await buildDir();
    const result = await render(renderEnv(dir, { ACTIVE_PAGE_COUNT: 10 }), deps(fakeBuild));
    expect(result).toMatchObject({ status: 'failed', failure: { kind: 'permanent' } });
  });

  it('metaFile sem o uso de redirects é permanente', async () => {
    const dir = await buildDir();
    const noUsage: BuildSite = async (options) => {
      await fakeBuild(options);
      await writeFile(options.env.SNAPSHOT_META_FILE!, JSON.stringify({ header: meta.header }));
    };
    expect(await render(renderEnv(dir), deps(noUsage))).toMatchObject({
      failure: { kind: 'permanent' },
    });
  });
});

describe('publish', () => {
  const s3 = {
    S3_ENDPOINT: 'http://s3',
    S3_ACCESS_KEY_ID: 'k',
    S3_SECRET_ACCESS_KEY: 's',
    BUILD_CACHE_BUCKET: 'build-cache',
  };

  function fakes(overrides: Partial<PublishDeps> = {}): PublishDeps {
    return {
      archive: vi.fn(async (_dir: string, _wrangler: string, file: string) =>
        writeFile(file, 'tgz'),
      ),
      deployCloudflare: vi.fn(() => Promise.resolve('cf-version')),
      uploadEdgeLocal: vi.fn(() => Promise.resolve('local-version')),
      uploadBuildCache: vi.fn(() => Promise.resolve()),
      now: () => 0,
      ...overrides,
    };
  }

  async function rendered() {
    const dir = await buildDir();
    await render(renderEnv(dir), deps(fakeBuild));
    return dir;
  }

  it('local: envia ao edge-local e ao build-cache e escreve publish.json', async () => {
    const dir = await rendered();
    const d = fakes();
    const env: PublishEnv = {
      ...s3,
      SITE_ID: 'exemplo-a',
      BUILD_DIR: dir,
      DEPLOY_TARGET: 'local',
      EDGE_LOCAL_URL: 'http://edge',
    };
    const result = await publish(env, d);
    expect(d.archive).toHaveBeenCalledWith(dir, 'local', expect.any(String));
    expect(d.uploadBuildCache).toHaveBeenCalledWith(
      expect.objectContaining({ bucket: 'build-cache' }),
      'exemplo-a/local-version.tar.gz',
      expect.any(String),
    );
    expect(result).toMatchObject({ status: 'ok', target: 'local', versionId: 'local-version' });
    expect(
      PublishResultSchema.parse(JSON.parse(await readFile(join(dir, 'publish.json'), 'utf8'))),
    ).toEqual(result);
  });

  it('cloudflare: wrangler com o alvo de produção e as credenciais', async () => {
    const dir = await rendered();
    const d = fakes();
    const env: PublishEnv = {
      ...s3,
      SITE_ID: 'exemplo-a',
      BUILD_DIR: dir,
      DEPLOY_TARGET: 'cloudflare',
      CLOUDFLARE_API_TOKEN: 't'.repeat(40),
      CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32),
    };
    expect(await publish(env, d)).toMatchObject({ status: 'ok', versionId: 'cf-version' });
    expect(d.deployCloudflare).toHaveBeenCalledWith(join(dir, 'wrangler.cloudflare.jsonc'), {
      apiToken: 't'.repeat(40),
      accountId: 'a'.repeat(32),
    });
  });

  it('sem render com sucesso, não publica (permanente)', async () => {
    const dir = await buildDir();
    const d = fakes();
    const env: PublishEnv = {
      ...s3,
      SITE_ID: 'exemplo-a',
      BUILD_DIR: dir,
      DEPLOY_TARGET: 'local',
      EDGE_LOCAL_URL: 'http://edge',
    };
    expect(await publish(env, d)).toMatchObject({
      status: 'failed',
      failure: { kind: 'permanent' },
    });
    expect(d.uploadEdgeLocal).not.toHaveBeenCalled();
  });
});

describe('uploadEdgeLocal', () => {
  async function server(status: number, body: string) {
    const requests: { method?: string; url?: string; type?: string; size: number }[] = [];
    const srv = createServer((req, res) => {
      let size = 0;
      req.on('data', (chunk: Buffer) => (size += chunk.length));
      req.on('end', () => {
        requests.push({
          method: req.method,
          url: req.url,
          type: req.headers['content-type'],
          size,
        });
        res.writeHead(status, { 'content-type': 'application/json' }).end(body);
      });
    }).listen(0);
    await new Promise((resolve) => srv.once('listening', resolve));
    return {
      url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}`,
      requests,
      close: () => srv.close(),
    };
  }

  it('PUT /sites/{site}/versions com o arquivo; devolve o id', async () => {
    const dir = await buildDir();
    const archive = join(dir, 'a.tgz');
    await writeFile(archive, 'conteudo');
    const s = await server(201, '{"id":"v7"}');
    try {
      expect(await uploadEdgeLocal(`${s.url}/`, 'exemplo-a', archive)).toBe('v7');
      expect(s.requests).toEqual([
        { method: 'PUT', url: '/sites/exemplo-a/versions', type: 'application/gzip', size: 8 },
      ]);
    } finally {
      s.close();
    }
  });

  it('4xx é permanente; 5xx e rede, transitórias', async () => {
    const dir = await buildDir();
    const archive = join(dir, 'a.tgz');
    await writeFile(archive, 'x');
    for (const [status, kind] of [
      [400, 'permanent'],
      [503, 'transient'],
    ] as const) {
      const s = await server(status, 'erro');
      await expect(uploadEdgeLocal(s.url, 'exemplo-a', archive)).rejects.toMatchObject({ kind });
      s.close();
    }
    await expect(uploadEdgeLocal('http://127.0.0.1:9', 'exemplo-a', archive)).rejects.toMatchObject(
      { kind: 'transient' },
    );
  });
});
