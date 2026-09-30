import { describe, expect, it } from 'vitest';

import { buildEventManifest, indexManifest, parseEventManifest } from './manifest.ts';

describe('manifesto de eventos', () => {
  it('build ordena por ID e descarta campos extras (saída idempotente)', () => {
    const articles = [
      { id: 7, path: '/b/' },
      { id: 2, path: '/a/', title: 'extra' },
    ];
    expect(buildEventManifest(articles)).toEqual({
      formatVersion: 1,
      articles: [
        { id: 2, path: '/a/' },
        { id: 7, path: '/b/' },
      ],
    });
  });

  it('o Worker valida o JSON e indexa por ID', () => {
    const parsed = parseEventManifest(
      JSON.parse(JSON.stringify(buildEventManifest([{ id: 1, path: '/x/' }]))),
    );
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && indexManifest(parsed.value).get(1)).toBe('/x/');
  });

  it.each([
    ['outra versão', { formatVersion: 2, articles: [] }],
    ['artigo sem caminho', { formatVersion: 1, articles: [{ id: 1 }] }],
    ['ID que não é inteiro positivo', { formatVersion: 1, articles: [{ id: 0, path: '/x/' }] }],
  ])('recusa %s', (_, json) => {
    expect(parseEventManifest(json).ok).toBe(false);
  });
});
