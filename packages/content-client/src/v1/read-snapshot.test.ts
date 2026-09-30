import { afterEach, describe, expect, it } from 'vitest';

import { failureKind } from '../index.ts';
import { readSnapshot } from './read-snapshot.ts';
import { readFixture, startServer, TOKEN, type Reply } from './test-server.ts';

let close: (() => Promise<void>) | undefined;

afterEach(async () => {
  await close?.();
  close = undefined;
});

async function serve(reply: (site: string) => Reply) {
  const server = await startServer(reply);
  close = server.close;
  return server.baseUrl;
}

describe('readSnapshot', () => {
  it.each(['exemplo-a', 'exemplo-b'])('lê o snapshot de %s em pedaços pequenos', async (site) => {
    const body = await readFixture(site);
    const baseUrl = await serve(() => ({ body, chunkSize: 7 }));
    const result = await readSnapshot({ baseUrl, site, token: TOKEN });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.header).toMatchObject({ site, schemaVersion: 1 });
    expect(result.value.end.counts.content).toBe(result.value.contents.length);
  });

  it('descarta campos desconhecidos (release antiga lendo snapshot novo)', async () => {
    const body = (await readFixture('exemplo-b')).replace(
      '"type":"header"',
      '"type":"header","futuro":true',
    );
    const baseUrl = await serve(() => ({ body }));
    const result = await readSnapshot({ baseUrl, site: 'exemplo-b', token: TOKEN });
    expect(result.ok && result.value.header).not.toHaveProperty('futuro');
  });

  it.each([
    ['token errado', { token: 'outro' }, 'http.401', 'permanent'],
    ['site inexistente', { site: 'nao-existe' }, 'http.404', 'permanent'],
  ])('%s', async (_, override, code, kind) => {
    // Como o backoffice: 404 para site que não existe.
    const baseUrl = await serve((site) => (site === 'exemplo-a' ? { body: '' } : { status: 404 }));
    const result = await readSnapshot({ baseUrl, site: 'exemplo-a', token: TOKEN, ...override });
    expect(!result.ok && result.issues[0]?.code).toBe(code);
    expect(!result.ok && failureKind(result.issues)).toBe(kind);
  });

  it('HTTP 500 é transitória', async () => {
    const baseUrl = await serve(() => ({ status: 500 }));
    const result = await readSnapshot({ baseUrl, site: 'exemplo-a', token: TOKEN });
    expect(!result.ok && failureKind(result.issues)).toBe('transient');
  });

  it('snapshot cortado (sem end, ou conexão caída) é transitório', async () => {
    const body = await readFixture('exemplo-a');
    const withoutEnd = body.trimEnd().split('\n').slice(0, -1).join('\n');
    let baseUrl = await serve(() => ({ body: withoutEnd }));
    let result = await readSnapshot({ baseUrl, site: 'exemplo-a', token: TOKEN });
    expect(!result.ok && failureKind(result.issues)).toBe('transient');

    await close?.();
    baseUrl = await serve(() => ({ body, chunkSize: 100, abortAfter: 500 }));
    result = await readSnapshot({ baseUrl, site: 'exemplo-a', token: TOKEN });
    expect(!result.ok && failureKind(result.issues)).toBe('transient');
  });

  it('linha inválida é permanente, com o número da linha', async () => {
    const lines = (await readFixture('exemplo-b')).trimEnd().split('\n');
    lines[2] = '{"type":"author","data":{"id":"x"}}';
    lines[3] = 'não é json';
    const baseUrl = await serve(() => ({ body: lines.join('\n') }));
    const result = await readSnapshot({ baseUrl, site: 'exemplo-b', token: TOKEN });
    expect(!result.ok && result.issues.map((issue) => issue.path[0])).toEqual(
      expect.arrayContaining([2, 3]),
    );
    expect(!result.ok && failureKind(result.issues)).toBe('permanent');
  });

  it('falha de rede é transitória', async () => {
    const result = await readSnapshot({
      baseUrl: 'http://127.0.0.1:1',
      site: 'exemplo-a',
      token: TOKEN,
    });
    expect(!result.ok && result.issues[0]?.code).toBe('network');
  });
});
