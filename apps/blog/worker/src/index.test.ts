import type { DataPoint } from '@orakel/events/v1';
import { afterEach, describe, expect, it, vi } from 'vitest';

import worker, { resetManifestCache } from './index.ts';
import { CHROME_DESKTOP, pageviewBody } from './test-builders.ts';

// Handler com env falso e Request do Node (ADR 0003). `cf` é acrescentado à mão, como a
// Cloudflare faz na borda.
function setup(options: { manifestStatus?: number; allowOverride?: string } = {}) {
  const points: DataPoint[] = [];
  const assetsFetch = vi.fn(() =>
    Promise.resolve(
      Response.json(
        { formatVersion: 1, articles: [{ id: 1, path: '/guia-completo/' }] },
        { status: options.manifestStatus ?? 200 },
      ),
    ),
  );
  const env = {
    SITE_ID: 'exemplo-a',
    ALLOW_COUNTRY_OVERRIDE: options.allowOverride ?? 'false',
    EVENTS: { writeDataPoint: (point: DataPoint) => void points.push(point) },
    ASSETS: { fetch: assetsFetch },
  } as unknown as Env;

  const call = (path: string, init: RequestInit = {}, cf: object = { country: 'BR' }) => {
    const request = Object.assign(new Request(`https://exemplo-a.com.br${path}`, init), { cf });
    return worker.fetch(request as unknown as Request<unknown, IncomingRequestCfProperties>, env);
  };

  const post = (body: string, headers: Record<string, string> = {}, cf?: object) =>
    call(
      '/_e/pageview',
      {
        method: 'POST',
        body,
        headers: { 'user-agent': CHROME_DESKTOP, 'sec-fetch-site': 'same-origin', ...headers },
      },
      cf,
    );

  return { assetsFetch, points, call, post };
}

afterEach(() => {
  resetManifestCache();
});

describe('Worker de borda', () => {
  it('responde 200 com sid, grava o ponto e não deixa cachear', async () => {
    const { post, points } = setup();
    const response = await post(pageviewBody());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toHaveProperty('sid');
    expect(points[0]?.indexes).toEqual(['exemplo-a']);
  });

  it('descarta sem corpo e sem detalhe', async () => {
    const { post } = setup();
    const response = await post(pageviewBody(), { 'sec-fetch-site': 'cross-site' });
    expect(response.status).toBe(403);
    expect(await response.text()).toBe('');
  });

  it('usa X-Test-Country só com ALLOW_COUNTRY_OVERRIDE', async () => {
    const allowed = setup({ allowOverride: 'true' });
    expect(await (await allowed.post(pageviewBody(), { 'x-test-country': 'DE' })).json()).toEqual(
      {},
    );

    const denied = setup();
    expect(
      await (await denied.post(pageviewBody(), { 'x-test-country': 'DE' })).json(),
    ).toHaveProperty('sid');
  });

  it('recusa corpo grande pelo Content-Length antes de ler', async () => {
    const { post } = setup();
    const response = await post(pageviewBody(), { 'content-length': '999999' });
    expect(response.status).toBe(413);
  });

  it('404 fora de /_e/pageview e 405 fora de POST', async () => {
    const { call } = setup();
    expect((await call('/_e/outra')).status).toBe(404);
    const get = await call('/_e/pageview');
    expect(get.status).toBe(405);
    expect(get.headers.get('allow')).toBe('POST');
  });

  it('falha no manifesto perde o evento com 204, registra e tenta de novo depois', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { post, assetsFetch, points } = setup({ manifestStatus: 500 });
    expect((await post(pageviewBody())).status).toBe(204);
    expect(points).toHaveLength(0);
    expect(error).toHaveBeenCalledOnce();
    await post(pageviewBody());
    expect(assetsFetch).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});
