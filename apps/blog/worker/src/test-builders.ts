// Dublês para os testes: requisição do fluxo, dependências e env do Worker.
// Não faz parte do Worker publicado (nada em src/index.ts importa daqui).
import type { DataPoint } from '@orakel/events/v1';

import type { PageviewDeps, PageviewRequest } from './pageview.ts';

export const SID = '5f2d1c3b-8a4e-4f6d-9b7c-1e2a3d4c5b6a';
export const NEW_SID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
export const EVENT_ID = '0b0f8a52-6b0e-4b8e-9d3a-2f1c5e7a9b10';
export const CHROME_DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
export const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

export const MANIFEST = new Map([
  [1, '/guia-completo/'],
  [2, '/rotina-da-manha/'],
]);

export function pageviewBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    formatVersion: 1,
    type: 'pageview',
    eventId: EVENT_ID,
    page: { articleId: 1 },
    ...overrides,
  });
}

export function buildRequest(
  overrides: Partial<PageviewRequest> & { body?: string } = {},
): PageviewRequest {
  const { body = pageviewBody(), ...rest } = overrides;
  return {
    userAgent: CHROME_DESKTOP,
    mobileHint: null,
    secFetchSite: 'same-origin',
    origin: 'https://exemplo-a.com.br',
    requestOrigin: 'https://exemplo-a.com.br',
    contentLength: null,
    country: 'BR',
    readBody: () => Promise.resolve(body),
    ...rest,
  };
}

export function buildDeps(overrides: Partial<PageviewDeps> = {}) {
  const points: DataPoint[] = [];
  return {
    points,
    deps: {
      site: 'exemplo-a',
      getManifest: () => Promise.resolve(MANIFEST),
      write: (point: DataPoint) => void points.push(point),
      uuid: () => NEW_SID,
      ...overrides,
    } satisfies PageviewDeps,
  };
}
