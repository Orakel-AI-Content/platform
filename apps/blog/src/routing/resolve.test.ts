import { beforeAll, describe, expect, it } from 'vitest';

import type { SiteData } from '../data/site-source.ts';
import { fixtureSite } from '../test-support.ts';
import { PAGE_SIZE, enumeratePaths, resolvePath } from './resolve.ts';

let a: SiteData;
beforeAll(async () => {
  a = await fixtureSite('exemplo-a');
});

describe('rotas do site', () => {
  it('enumera todas as páginas da fixture, em ordem', () => {
    expect(enumeratePaths(a)).toEqual([
      '/',
      '/autor/ana-souza/',
      '/autor/bruno-lima/',
      '/busca/',
      '/categoria/guias/',
      '/guia-completo/',
      '/privacidade/',
      '/quem-somos/',
      '/rotina-da-manha/',
      '/serie/primeiros-passos/',
      '/sobre/',
      '/tag/iniciantes/',
    ]);
  });

  it('resolve cada tipo de página', () => {
    expect(resolvePath(a, '/').type).toBe('home');
    expect(resolvePath(a, '/guia-completo/')).toMatchObject({
      type: 'content',
      content: { id: 1 },
    });
    expect(resolvePath(a, '/quem-somos/')).toMatchObject({
      type: 'content',
      content: { kind: 'page' },
    });
    expect(resolvePath(a, '/categoria/guias/')).toMatchObject({ type: 'taxonomy', page: 1 });
    expect(resolvePath(a, '/autor/ana-souza/')).toMatchObject({ type: 'author', totalPages: 1 });
    expect(resolvePath(a, '/sobre/')).toMatchObject({
      type: 'institutional',
      key: 'about',
      title: 'Sobre',
    });
    expect(resolvePath(a, '/busca/').type).toBe('search');
    expect(resolvePath(a, '/nao-existe/').type).toBe('not-found');
  });

  it('listas só com artigos, do mais recente ao mais antigo', () => {
    const home = resolvePath(a, '/');
    expect(home.type === 'home' && home.items.map((item) => item.slug)).toEqual([
      'rotina-da-manha',
      'guia-completo',
    ]);
  });

  it('pagina a partir de PAGE_SIZE artigos', () => {
    const [first] = a.contents;
    const many = {
      ...a,
      contents: Array.from({ length: PAGE_SIZE + 1 }, (_, i) => ({
        ...first!,
        id: 100 + i,
        slug: `artigo-${i}`,
        kind: 'article' as const,
        publishedAt: `2026-09-${String(10 + i).padStart(2, '0')}T10:00:00-03:00`,
      })),
    };
    expect(resolvePath(many, '/pagina/2/')).toMatchObject({ type: 'home', page: 2, totalPages: 2 });
    expect(resolvePath(many, '/pagina/3/').type).toBe('not-found');
  });

  it('sem a flag busca, não há /busca/', () => {
    const site = { ...a, config: { ...a.config, featureFlags: {} } };
    expect(resolvePath(site, '/busca/').type).toBe('not-found');
  });
});
