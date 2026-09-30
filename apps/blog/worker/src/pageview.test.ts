import { COLUMNS, MAX_BODY_BYTES } from '@orakel/events/v1';
import { describe, expect, it } from 'vitest';

import { handlePageview } from './pageview.ts';
import { buildDeps, buildRequest, NEW_SID, pageviewBody, SID } from './test-builders.ts';

const blob = (point: { blobs: string[] } | undefined, field: keyof typeof COLUMNS) =>
  point?.blobs[Number(COLUMNS[field].replace('blob', '')) - 1];

describe('handlePageview', () => {
  it('grava o pageview de um artigo com o caminho do manifesto e emite sessão', async () => {
    const { deps, points } = buildDeps();
    const outcome = await handlePageview(
      buildRequest({ body: pageviewBody({ referrer: 'https://www.google.com/search?q=x' }) }),
      deps,
    );
    expect(outcome).toEqual({ status: 200, body: { sid: NEW_SID } });
    expect(points).toHaveLength(1);
    expect(points[0]?.indexes).toEqual(['exemplo-a']);
    expect(blob(points[0], 'type')).toBe('pageview');
    expect(blob(points[0], 'path')).toBe('/guia-completo/');
    expect(blob(points[0], 'articleId')).toBe('1');
    expect(blob(points[0], 'country')).toBe('BR');
    expect(blob(points[0], 'device')).toBe('desktop');
    expect(blob(points[0], 'referrerHost')).toBe('www.google.com');
    expect(blob(points[0], 'sid')).toBe(NEW_SID);
  });

  it('mantém o sid recebido enquanto a sessão vale', async () => {
    const { deps } = buildDeps();
    const outcome = await handlePageview(buildRequest({ body: pageviewBody({ sid: SID }) }), deps);
    expect(outcome.body).toEqual({ sid: SID });
  });

  it('página que não é artigo usa o caminho do payload', async () => {
    const { deps, points } = buildDeps();
    await handlePageview(
      buildRequest({ body: pageviewBody({ page: { pageType: 'home', path: '/' } }) }),
      deps,
    );
    expect(blob(points[0], 'path')).toBe('/');
    expect(blob(points[0], 'articleId')).toBe('');
  });

  it('no EEE, Reino Unido e Suíça não emite nem guarda sessão', async () => {
    const { deps, points } = buildDeps();
    const outcome = await handlePageview(
      buildRequest({ country: 'DE', body: pageviewBody({ sid: SID }) }),
      deps,
    );
    expect(outcome).toEqual({ status: 200, body: {} });
    expect(blob(points[0], 'sid')).toBe('');
  });

  it.each([
    ['bot', buildRequest({ userAgent: 'Googlebot/2.1' }), 204],
    ['origin', buildRequest({ secFetchSite: 'cross-site' }), 403],
    ['size', buildRequest({ contentLength: MAX_BODY_BYTES + 1 }), 413],
    ['size', buildRequest({ body: 'x'.repeat(MAX_BODY_BYTES + 1) }), 413],
    ['schema', buildRequest({ body: '{nao-json' }), 400],
    ['schema', buildRequest({ body: pageviewBody({ eventId: 'abc' }) }), 400],
    ['manifest', buildRequest({ body: pageviewBody({ page: { articleId: 99 } }) }), 422],
  ])('descarta por %s com o status certo e um ponto discard', async (reason, request, status) => {
    const { deps, points } = buildDeps();
    expect(await handlePageview(request, deps)).toEqual({ status });
    expect(points).toHaveLength(1);
    expect(blob(points[0], 'type')).toBe('discard');
    expect(blob(points[0], 'discardReason')).toBe(reason);
    expect(blob(points[0], 'path')).toBe('');
  });

  it('não lê o corpo de um bot nem de origem errada', async () => {
    const { deps } = buildDeps();
    const readBody = () => Promise.reject(new Error('não deveria ler'));
    await expect(
      handlePageview(buildRequest({ userAgent: null, readBody }), deps),
    ).resolves.toEqual({ status: 204 });
  });
});
