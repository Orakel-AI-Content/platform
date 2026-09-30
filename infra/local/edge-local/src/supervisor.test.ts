import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { adminHandler } from './admin.ts';
import { siteOfHost } from './proxy.ts';
import type { Runtime } from './runtime.ts';
import { Store } from './store.ts';
import { Supervisor } from './supervisor.ts';
import { makeArchive, removeTree } from './test-archive.ts';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(removeTree));
});

function fakeRuntime(fail = false) {
  let port = 9000;
  const disposed: string[] = [];
  const runtime: Runtime = {
    start: vi.fn((config: string) => {
      if (fail) return Promise.reject(new Error('workerd: erro de sintaxe'));
      const url = new URL(`http://127.0.0.1:${(port += 1)}/`);
      return Promise.resolve({
        url,
        dispose: () => {
          disposed.push(config);
          return Promise.resolve();
        },
      });
    }),
  };
  return { runtime, disposed };
}

async function supervisor(fail = false) {
  const dir = await mkdtemp(join(tmpdir(), 'edge-sup-'));
  dirs.push(dir);
  const fake = fakeRuntime(fail);
  const sup = new Supervisor({
    store: new Store(dir),
    runtime: fake.runtime,
    keep: 10,
    log: () => undefined,
  });
  return { sup, dir, ...fake };
}

describe('Supervisor', () => {
  it('publica: sobe a nova antes de desligar a antiga', async () => {
    const { sup, disposed } = await supervisor();
    const archive = await makeArchive('exemplo-a', 'A');
    const a = await sup.publish('exemplo-a', archive);
    const firstUrl = sup.target('exemplo-a');
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const b = await sup.publish('exemplo-a', archive);
    expect(sup.activeId('exemplo-a')).toBe(b);
    expect(sup.target('exemplo-a')).not.toEqual(firstUrl);
    expect(disposed).toEqual([expect.stringContaining(a)]);
    expect(await sup.store.active('exemplo-a')).toBe(b);
  });

  it('versão que não sobe é apagada e a ativa continua', async () => {
    const { sup } = await supervisor(true);
    await expect(
      sup.publish('exemplo-a', await makeArchive('exemplo-a', 'A')),
    ).rejects.toMatchObject({ status: 400 });
    expect(await sup.store.ids('exemplo-a')).toEqual([]);
    expect(sup.target('exemplo-a')).toBeUndefined();
  });

  it('uma operação por vez por site (409)', async () => {
    const { sup } = await supervisor();
    const archive = await makeArchive('exemplo-a', 'A');
    const results = await Promise.allSettled([
      sup.publish('exemplo-a', archive),
      sup.publish('exemplo-a', archive),
    ]);
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
    expect((results[1] as PromiseRejectedResult).reason).toMatchObject({ status: 409 });
  });

  it('reinício sobe as versões ativas', async () => {
    const { sup, dir } = await supervisor();
    await sup.publish('exemplo-a', await makeArchive('exemplo-a', 'A'));
    const again = new Supervisor({
      store: new Store(dir),
      runtime: fakeRuntime().runtime,
      keep: 10,
      log: () => undefined,
    });
    await again.restore();
    expect(again.activeId('exemplo-a')).toBe(sup.activeId('exemplo-a'));
  });
});

describe('proxy e administração', () => {
  it('site pelo Host', () => {
    expect(siteOfHost('exemplo-a.localhost')).toBe('exemplo-a');
    expect(siteOfHost('Exemplo-A.localhost:8080')).toBe('exemplo-a');
    expect(siteOfHost('media.exemplo-a.localhost')).toBeUndefined();
    expect(siteOfHost('exemplo-a.com.br')).toBeUndefined();
    expect(siteOfHost(undefined)).toBeUndefined();
  });

  it('rotas, erros e pontos do ae-sim', async () => {
    const { sup, dir } = await supervisor();
    const handler = adminHandler(sup, dir, () => undefined);
    const call = async (method: string, path: string, body?: string | Uint8Array) => {
      const { createServer } = await import('node:http');
      const server = createServer((req, res) => void handler(req, res)).listen(0);
      await new Promise((resolve) => server.once('listening', resolve));
      const port = (server.address() as { port: number }).port;
      const response = await fetch(`http://127.0.0.1:${port}${path}`, { method, body });
      server.close();
      return { status: response.status, body: (await response.text()).trim() };
    };
    const put = await call('PUT', '/sites/exemplo-a/versions', await makeArchive('exemplo-a', 'A'));
    expect(put.status).toBe(201);
    const { id } = JSON.parse(put.body) as { id: string };
    expect(JSON.parse((await call('GET', '/sites/exemplo-a/versions')).body)).toMatchObject({
      active: id,
    });
    expect((await call('POST', '/sites/exemplo-a/rollback')).status).toBe(404);
    expect(await call('POST', '/sites/exemplo-a/rollback', '{"id":1}')).toMatchObject({
      status: 400,
    });
    expect(await call('POST', '/sites/exemplo-a/rollback', '{')).toMatchObject({ status: 400 });
    expect((await call('GET', '/nada')).status).toBe(404);
    expect(
      (
        await call(
          'POST',
          '/_ae-sim/points',
          '{"indexes":["exemplo-a"],"blobs":["1"],"doubles":[1]}',
        )
      ).status,
    ).toBe(204);
    const day = new Date().toISOString().slice(0, 10);
    expect(await readFile(join(dir, 'events', `${day}.ndjson`), 'utf8')).toContain(
      '"indexes":["exemplo-a"]',
    );
    expect(JSON.parse((await call('GET', '/healthz')).body)).toEqual({
      ok: true,
      sites: ['exemplo-a'],
    });
  });

  it('/healthz responde 503 até o proxy estar no ar', async () => {
    const { sup, dir } = await supervisor();
    let ready = false;
    const handler = adminHandler(
      sup,
      dir,
      () => undefined,
      () => ready,
    );
    const { createServer } = await import('node:http');
    const server = createServer((req, res) => void handler(req, res)).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/healthz`;
    expect((await fetch(url)).status).toBe(503);
    ready = true;
    expect((await fetch(url)).status).toBe(200);
    server.close();
  });
});
