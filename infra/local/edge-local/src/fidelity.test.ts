// Spike de fidelidade da L0 como teste permanente (ADR 0004 da unidade): o Worker real do
// blog, com assets, no runtime do wrangler, atrás do proxy do edge-local. O que divergir do
// Workers Static Assets da Cloudflare vai para o ADR e para a lista da fase 1.
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startAdmin } from './admin.ts';
import { ndjsonSink } from './ae-sink.ts';
import { startProxy } from './proxy.ts';
import { wranglerRuntime } from './runtime.ts';
import { writeAeSimConfig } from './server.ts';
import { Store } from './store.ts';
import { Supervisor } from './supervisor.ts';
import { makeArchive, removeTree } from './test-archive.ts';

let dir: string;
let supervisor: Supervisor;
let admin: Server;
let proxy: Server;
let adminUrl: string;
let siteUrl: string;

const portOf = async (server: Server) => {
  if (!server.listening) await new Promise((resolve) => server.once('listening', resolve));
  return (server.address() as AddressInfo).port;
};

type SiteResponse = { status: number; headers: Headers; text: () => Promise<string> };

/**
 * Requisição ao site pelo proxy, com o Host do site. O fetch do Node ignora o cabeçalho
 * Host; o Caddy manda o Host real, e é isso que este cliente reproduz.
 */
function site(
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
  host = 'exemplo-a.localhost',
): Promise<SiteResponse> {
  return new Promise((resolve, reject) => {
    const req = request(
      `${siteUrl}${path}`,
      { method: init.method ?? 'GET', headers: { host, ...init.headers } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const headers = new Headers();
          for (const [name, value] of Object.entries(res.headers)) {
            if (typeof value === 'string') headers.set(name, value);
          }
          const body = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode ?? 0, headers, text: () => Promise.resolve(body) });
        });
      },
    );
    req.on('error', reject);
    req.end(init.body);
  });
}

const publish = async (label: string) => {
  const response = await fetch(`${adminUrl}/sites/exemplo-a/versions`, {
    method: 'PUT',
    body: await makeArchive('exemplo-a', label),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { id: string }).id;
};

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'edge-fidelity-'));
  supervisor = new Supervisor({
    store: new Store(dir),
    runtime: wranglerRuntime(join(dir, 'registry')),
    keep: 10,
    log: () => undefined,
  });
  admin = startAdmin(supervisor, ndjsonSink(dir), 0, () => undefined);
  const adminPort = await portOf(admin);
  adminUrl = `http://127.0.0.1:${adminPort}`;
  await supervisor.startAeSim(await writeAeSimConfig(dir, adminPort));
  proxy = startProxy(supervisor, 0);
  siteUrl = `http://127.0.0.1:${await portOf(proxy)}`;
  await publish('versão A');
});

afterAll(async () => {
  proxy.close();
  admin.close();
  await supervisor.stop();
  await removeTree(dir);
});

describe('fidelidade ao Workers Static Assets', () => {
  it('_headers: noindex em tudo e immutable só nos assets com hash', async () => {
    const home = await site('/');
    expect(home.status).toBe(200);
    expect(home.headers.get('x-robots-tag')).toBe('noindex');
    expect(home.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
    const css = await site('/_astro/app.1a2b3c4d.css');
    expect(css.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  it('_redirects e barra final (html_handling: auto-trailing-slash)', async () => {
    const redirect = await site('/antigo/');
    expect([redirect.status, redirect.headers.get('location')]).toEqual([301, '/artigo/']);
    const slash = await site('/artigo');
    expect(slash.status).toBe(307);
    expect(slash.headers.get('location')).toMatch(/\/artigo\/$/);
  });

  it('404: a 404.html com status 404 (not_found_handling: 404-page)', async () => {
    const missing = await site('/nao-existe/');
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain('Página não encontrada');
  });

  it('/_e/* chega ao Worker, e o ae-sim grava o ponto (EVENTS por service binding)', async () => {
    const response = await site('/_e/pageview', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'sec-fetch-site': 'same-origin',
        'user-agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/140.0 Safari/537.36',
        'x-test-country': 'BR',
      },
      body: JSON.stringify({
        formatVersion: 1,
        type: 'pageview',
        eventId: crypto.randomUUID(),
        page: { articleId: 1 },
      }),
    });
    expect(response.status).toBe(200);
    const events = join(dir, 'events');
    let lines: string[] = [];
    for (let attempt = 0; attempt < 30 && lines.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const files = await readdir(events).catch(() => [] as string[]);
      lines = (await Promise.all(files.map((file) => readFile(join(events, file), 'utf8'))))
        .join('')
        .split('\n')
        .filter(Boolean);
    }
    expect(JSON.parse(lines[0]!)).toMatchObject({
      indexes: ['exemplo-a'],
      blobs: [
        '1',
        'pageview',
        '/artigo/',
        '1',
        'BR',
        'desktop',
        '',
        expect.stringMatching(/^[0-9a-f-]{36}$/),
        '',
      ],
      doubles: [1],
    });
  });
});

describe('versões', () => {
  it('troca sem queda: nenhuma requisição falha durante o publish', async () => {
    let running = true;
    const statuses: number[] = [];
    const load = (async () => {
      while (running) statuses.push((await site('/')).status);
    })();
    await publish('versão B');
    running = false;
    await load;
    expect(statuses.length).toBeGreaterThan(5);
    expect(statuses.every((status) => status === 200)).toBe(true);
    expect(await (await site('/')).text()).toContain('versão B');
  });

  it('rollback volta ao conteúdo anterior', async () => {
    const response = await fetch(`${adminUrl}/sites/exemplo-a/rollback`, { method: 'POST' });
    expect(response.status).toBe(200);
    expect(await (await site('/')).text()).toContain('versão A');
  });

  it('site sem versão: 404 do edge-local', async () => {
    expect((await site('/', {}, 'exemplo-b.localhost')).status).toBe(404);
  });
});
