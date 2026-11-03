import { afterEach, describe, expect, it } from 'vitest';

import { failureKind, type SnapshotKind } from '../index.ts';
import { readSnapshot } from './read-snapshot.ts';
import { readFixture, startServer, TOKEN, type Reply } from './test-server.ts';

let close: (() => Promise<void>) | undefined;

afterEach(async () => {
  await close?.();
  close = undefined;
});

async function serve(reply: (site: string, kind: SnapshotKind) => Reply) {
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

  it('lê o snapshot da visualização pela rota dele', async () => {
    const body = await readFixture('exemplo-a');
    const baseUrl = await serve((_, kind) => (kind === 'preview' ? { body } : { status: 404 }));
    const result = await readSnapshot({
      baseUrl,
      site: 'exemplo-a',
      kind: 'preview',
      token: TOKEN,
    });
    expect(result.ok).toBe(true);
    expect(await readSnapshot({ baseUrl, site: 'exemplo-a', token: TOKEN })).toMatchObject({
      ok: false,
      issues: [{ code: 'http.404' }],
    });
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

  describe('culpado', () => {
    /** Altera o `data` do primeiro conteúdo do snapshot e devolve o id dele. */
    async function withContent(change: (data: Record<string, unknown>) => void) {
      const lines = (await readFixture('exemplo-b')).trimEnd().split('\n');
      const index = lines.findIndex((line) => line.includes('"type":"content"'));
      const line = JSON.parse(lines[index] ?? '') as { data: Record<string, unknown> };
      change(line.data);
      lines[index] = JSON.stringify(line);
      return { body: lines.join('\n'), id: String(line.data.id) };
    }

    it('conteúdo inválido no parse aponta o conteúdo pelo id', async () => {
      const { body, id } = await withContent((data) => {
        data.slug = 'Slug Inválido!';
      });
      const baseUrl = await serve(() => ({ body }));
      const result = await readSnapshot({ baseUrl, site: 'exemplo-b', token: TOKEN });
      expect(result).toMatchObject({ ok: false, culprit: { origin: 'content', reference: id } });
    });

    it('referência quebrada na semântica aponta o conteúdo pelo id', async () => {
      const { body, id } = await withContent((data) => {
        data.authorIds = [987654];
      });
      const baseUrl = await serve(() => ({ body }));
      const result = await readSnapshot({ baseUrl, site: 'exemplo-b', token: TOKEN });
      expect(!result.ok && result.issues[0]?.path.slice(0, 1)).toEqual(['contents']);
      expect(result).toMatchObject({ ok: false, culprit: { origin: 'content', reference: id } });
    });

    it('configuração inválida aponta a configuração', async () => {
      const lines = (await readFixture('exemplo-b')).trimEnd().split('\n');
      const index = lines.findIndex((line) => line.includes('"type":"config"'));
      lines[index] = '{"type":"config","data":{}}';
      const baseUrl = await serve(() => ({ body: lines.join('\n') }));
      const result = await readSnapshot({ baseUrl, site: 'exemplo-b', token: TOKEN });
      expect(result).toMatchObject({
        ok: false,
        culprit: { origin: 'config', reference: 'config' },
      });
    });

    it('estrutura, rede, HTTP e linha que não é JSON não têm culpado', async () => {
      const body = await readFixture('exemplo-a');
      const lines = body.trimEnd().split('\n');
      const cases = [
        { body: lines.slice(0, -1).join('\n') },
        { body: [lines[0], 'não é json', ...lines.slice(1)].join('\n') },
        { status: 500 },
      ];
      for (const reply of cases) {
        await close?.();
        const baseUrl = await serve(() => reply);
        const result = await readSnapshot({ baseUrl, site: 'exemplo-a', token: TOKEN });
        expect(result.ok).toBe(false);
        expect(result).not.toHaveProperty('culprit');
      }
      const offline = await readSnapshot({
        baseUrl: 'http://127.0.0.1:1',
        site: 'exemplo-a',
        token: TOKEN,
      });
      expect(offline).not.toHaveProperty('culprit');
    });
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
