// Paridade estático × SSR: o mesmo artigo das fixtures nos dois modos, HTML normalizado.
// Diferença quebra o CI (a visualização precisa mostrar o que vai ser publicado).
import { expect, test } from '@playwright/test';

import { SERVERS } from '../playwright.config.ts';
import { normalizeHtml } from './normalize.ts';

const ARTICLES = [
  ['exemplo-a', '/guia-completo/'],
  ['exemplo-a', '/categoria/guias/'],
  ['exemplo-b', '/arroz-de-forno/'],
  ['exemplo-b', '/'],
] as const;

for (const [site, path] of ARTICLES) {
  test(`${site} ${path}: estático e visualização geram o mesmo HTML`, async ({ request }) => {
    const [published, preview] = await Promise.all([
      request.get(`${SERVERS[site]}${path}`),
      request.get(`${SERVERS.preview}/${site}${path}`),
    ]);
    expect(published.status()).toBe(200);
    expect(preview.status()).toBe(200);
    expect(preview.headers()['x-robots-tag']).toBe('noindex');
    expect(normalizeHtml(await preview.text(), `/${site}`)).toBe(
      normalizeHtml(await published.text()),
    );
  });
}
