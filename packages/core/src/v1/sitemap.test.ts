import { beforeAll, describe, expect, it } from 'vitest';
import type { Snapshot } from '@orakel/content-model/v1';
import { sitemaps } from './sitemap.ts';
import { changed, fixture, indexable } from './test-snapshots.ts';

let a: Snapshot;
beforeAll(async () => {
  a = await fixture('exemplo-a');
});

describe('sitemaps', () => {
  it('com indexavel desligado, só o índice vazio', () => {
    expect(sitemaps(a)).toEqual([
      {
        path: '/sitemap.xml',
        xml: '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</sitemapindex>\n',
      },
    ]);
  });

  it('índice + um arquivo por tipo, só com páginas indexáveis', () => {
    const files = sitemaps(indexable(a));
    expect(files.map((file) => file.path)).toEqual([
      '/sitemap.xml',
      '/sitemap-artigos.xml',
      '/sitemap-paginas.xml',
      '/sitemap-categorias.xml',
      '/sitemap-tags.xml',
      '/sitemap-series.xml',
      '/sitemap-autores.xml',
    ]);
    const byPath = Object.fromEntries(files.map((file) => [file.path, file.xml]));
    expect(byPath['/sitemap.xml']).toMatchSnapshot();
    expect(byPath['/sitemap-paginas.xml']).toMatchSnapshot();
    expect(byPath['/sitemap-artigos.xml']).toContain(
      '<url><loc>https://exemplo-a.com.br/guia-completo/</loc><lastmod>2026-09-25T09:30:00-03:00</lastmod></url>',
    );
    expect(Object.values(byPath).join('')).not.toContain('/pagina/');
    expect(Object.values(byPath).join('')).not.toContain('/busca/');
  });

  it('taxonomia e autor sem conteúdo ficam de fora; tipo vazio não gera arquivo', () => {
    const snapshot = indexable(
      changed(a, (copy) => {
        copy.contents = copy.contents.filter((content) => content.kind === 'page');
      }),
    );
    expect(sitemaps(snapshot).map((file) => file.path)).toEqual([
      '/sitemap.xml',
      '/sitemap-paginas.xml',
    ]);
  });

  it('divide um tipo acima do limite de URLs', () => {
    const paths = sitemaps(indexable(a), 1).map((file) => file.path);
    expect(paths).toContain('/sitemap-artigos-2.xml');
    expect(paths).toContain('/sitemap-paginas-4.xml');
  });
});
