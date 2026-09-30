import { beforeAll, describe, expect, it } from 'vitest';
import type { Snapshot } from '@orakel/content-model/v1';
import {
  authorPath,
  contentPath,
  homePath,
  institutionalPages,
  routeConflicts,
  taxonomyPath,
} from './routes.ts';
import { changed, fixture } from './test-snapshots.ts';

let a: Snapshot;
beforeAll(async () => {
  a = await fixture('exemplo-a');
});

describe('rotas', () => {
  it('montam os caminhos com barra final e paginação a partir da página 2', () => {
    expect(homePath()).toBe('/');
    expect(homePath(1)).toBe('/');
    expect(homePath(2)).toBe('/pagina/2/');
    expect(contentPath({ slug: 'guia-completo' })).toBe('/guia-completo/');
    expect(taxonomyPath({ kind: 'category', slug: 'guias' })).toBe('/categoria/guias/');
    expect(taxonomyPath({ kind: 'tag', slug: 'iniciantes' }, 3)).toBe('/tag/iniciantes/pagina/3/');
    expect(taxonomyPath({ kind: 'series', slug: 'primeiros-passos' })).toBe(
      '/serie/primeiros-passos/',
    );
    expect(authorPath({ slug: 'ana-souza' }, 2)).toBe('/autor/ana-souza/pagina/2/');
  });

  it('recusam página inválida', () => {
    expect(() => homePath(0)).toThrow(RangeError);
    expect(() => authorPath({ slug: 'x' }, 1.5)).toThrow(RangeError);
  });

  it('institucionais só com texto na configuração', () => {
    expect(institutionalPages(a).map((page) => page.path)).toEqual(['/sobre/', '/privacidade/']);
    expect(institutionalPages(changed(a, (copy) => delete copy.config.institutionalTexts))).toEqual(
      [],
    );
  });
});

describe('routeConflicts', () => {
  it('as fixtures não têm colisões', async () => {
    expect(routeConflicts(a)).toEqual([]);
    expect(routeConflicts(await fixture('exemplo-b'))).toEqual([]);
  });

  it('aponta slug reservado: segmento de rota ou institucional', () => {
    const snapshot = changed(a, (copy) => {
      copy.contents[1]!.slug = 'categoria';
      copy.contents[2]!.slug = 'sobre';
    });
    expect(routeConflicts(snapshot).map((issue) => [issue.code, issue.path])).toEqual([
      ['route.reserved-slug', ['contents', 1, 'slug']],
      ['route.reserved-slug', ['contents', 2, 'slug']],
    ]);
  });

  it('aponta redirect que esconde uma página viva, com ou sem barra final', () => {
    const snapshot = changed(a, (copy) => {
      copy.redirects.push(
        { id: 2, from: '/guia-completo', to: '/outro/', status: 301, origin: 'manual' },
        { id: 3, from: '/rotina-da-manha/', to: '/outro/', status: 302, origin: 'manual' },
      );
    });
    expect(routeConflicts(snapshot).map((issue) => [issue.code, issue.path])).toEqual([
      ['route.redirect-shadows-page', ['redirects', 1, 'from']],
      ['route.redirect-shadows-page', ['redirects', 2, 'from']],
    ]);
  });
});
