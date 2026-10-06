import { describe, expect, it, vi } from 'vitest';

import { BuildError, permanent } from './errors.ts';
import { FIXTURE_BASE_URL, fixtureFetch, fixturePath } from './fixture-fetch.ts';
import { PREVIEW_CACHE_MS, loadPreviewSite } from './preview.ts';

const fixtureEnv = { CONTENT_SOURCE: 'fixture' as const };

describe('fixtureFetch', () => {
  it('serve a fixture do site nas rotas do snapshot e 404 no resto', async () => {
    for (const route of ['snapshot', 'preview-snapshot']) {
      const ok = await fixtureFetch(`${FIXTURE_BASE_URL}/api/export/v1/sites/exemplo-b/${route}`);
      expect(ok.status).toBe(200);
      expect((await ok.text()).split('\n')[0]).toContain('"site":"exemplo-b"');
    }
    expect(
      (await fixtureFetch(`${FIXTURE_BASE_URL}/api/export/v1/sites/nao-existe/snapshot`)).status,
    ).toBe(404);
    expect((await fixtureFetch(new Request(`${FIXTURE_BASE_URL}/outra`))).status).toBe(404);
    expect(fixturePath('exemplo-a')).toMatch(/exemplo-a\.ndjson$/);
  });
});

describe('loadPreviewSite', () => {
  it('lê o site, guarda por alguns segundos e devolve undefined para site inexistente', async () => {
    const first = await loadPreviewSite('exemplo-a', fixtureEnv, 1_000);
    expect(first?.config.siteId).toBe('exemplo-a');
    expect(await loadPreviewSite('exemplo-a', fixtureEnv, 1_000 + PREVIEW_CACHE_MS - 1)).toBe(
      first,
    );
    expect(await loadPreviewSite('exemplo-a', fixtureEnv, 1_000 + PREVIEW_CACHE_MS)).not.toBe(
      first,
    );
    expect(await loadPreviewSite('nao-existe', fixtureEnv)).toBeUndefined();
  });

  it('falha da API vira BuildError classificado e não fica em cache', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('erro', { status: 503 }));
    vi.stubGlobal('fetch', fetch);
    const env = {
      CONTENT_SOURCE: 'api' as const,
      EXPORT_API_URL: 'http://api.invalid',
      EXPORT_PREVIEW_TOKEN: 'x'.repeat(32),
    };
    await expect(loadPreviewSite('site-api', env, 5)).rejects.toMatchObject({
      name: 'BuildError',
      kind: 'transient',
    });
    await expect(loadPreviewSite('site-api', env, 6)).rejects.toBeInstanceOf(BuildError);
    expect(fetch).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it('com a API, lê o snapshot de visualização com o token da visualização', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response('', { status: 503 }));
    vi.stubGlobal('fetch', fetch);
    const token = 'p'.repeat(32);
    await loadPreviewSite(
      'site-token',
      { CONTENT_SOURCE: 'api', EXPORT_API_URL: 'http://api.invalid', EXPORT_PREVIEW_TOKEN: token },
      5,
    ).catch(() => undefined);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('http://api.invalid/api/export/v1/sites/site-token/preview-snapshot');
    expect(init?.headers).toMatchObject({ authorization: `Bearer ${token}` });
    vi.unstubAllGlobals();
  });
});

describe('erros', () => {
  it('problemas do core são permanentes, com os códigos na mensagem', () => {
    const error = permanent('Arquivos da borda', [{ code: 'route.reserved-slug', message: 'x' }]);
    expect(error.kind).toBe('permanent');
    expect(error.message).toContain('route.reserved-slug: x');
  });
});
