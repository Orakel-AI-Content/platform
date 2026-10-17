import { describe, expect, it } from 'vitest';

import type { Actor } from '../domain/access/rbac.ts';
import navigationConfig, {
  activeNavigationKey,
  filterNavigation,
  navigationPath,
  NAV_ITEM_TYPE_ITEM,
  NAV_ITEM_TYPE_TITLE,
  type NavigationTree,
} from './navigation.config.ts';

// Navegação do Backoffice (#236): árvore filtrada pelo RBAC, caminho por site e item ativo pelo
// pathname, com as mesmas regras da barra de antes (`sites/[site]/layout.tsx`, `site-nav.tsx`).

const actor = (role: Actor['roles'][number]): Actor => ({ email: `${role}@x`, roles: [role] });

/** Títulos das áreas do site na árvore filtrada. */
const siteAreas = (tree: NavigationTree[]) =>
  tree.find((nav) => nav.key === 'site')?.subMenu.map((nav) => nav.title);

const SETE = ['Visão geral', 'Conteúdos', 'Revisão', 'Mídia', 'Autores', 'Taxonomias', 'Menus'];

const item = (key: string, authority: NavigationTree['authority']): NavigationTree => ({
  key,
  path: `/${key}`,
  title: key,
  icon: 'sites',
  type: NAV_ITEM_TYPE_ITEM,
  authority,
  subMenu: [],
});

describe('filterNavigation', () => {
  it('editor e admin veem as 7 áreas e "Textos institucionais" (content.write)', () => {
    for (const role of ['editor', 'admin'] as const) {
      expect(siteAreas(filterNavigation(navigationConfig, actor(role)))).toEqual([
        ...SETE,
        'Textos institucionais',
      ]);
    }
  });

  it('operacao e revisor veem só as 7', () => {
    for (const role of ['operacao', 'revisor'] as const) {
      expect(siteAreas(filterNavigation(navigationConfig, actor(role)))).toEqual(SETE);
    }
  });

  it('"Sites" aparece para todos os papéis', () => {
    for (const role of ['admin', 'editor', 'revisor', 'operacao'] as const) {
      expect(filterNavigation(navigationConfig, actor(role))[0]?.title).toBe('Sites');
    }
  });

  it('authority vazia é visível para qualquer actor; basta uma das permissões', () => {
    const tree = [item('livre', []), item('qualquer', ['release.promote', 'content.write'])];
    expect(filterNavigation(tree, { email: 'x', roles: [] }).map((nav) => nav.key)).toEqual([
      'livre',
    ]);
    expect(filterNavigation(tree, actor('editor')).map((nav) => nav.key)).toEqual([
      'livre',
      'qualquer',
    ]);
  });

  it('grupo sem itens visíveis sai da árvore', () => {
    const tree: NavigationTree[] = [
      {
        ...item('grupo', []),
        type: NAV_ITEM_TYPE_TITLE,
        subMenu: [item('so-operacao', ['operations.run'])],
      },
    ];
    expect(filterNavigation(tree, actor('editor'))).toEqual([]);
    expect(filterNavigation(tree, actor('operacao'))[0]?.subMenu).toHaveLength(1);
  });
});

describe('navigationPath', () => {
  it('as áreas apontam para os mesmos endereços da antiga SiteNav', () => {
    const areas = navigationConfig.find((nav) => nav.key === 'site')?.subMenu ?? [];
    expect(areas.map((nav) => navigationPath(nav, 'exemplo-a'))).toEqual([
      '/sites/exemplo-a',
      '/sites/exemplo-a/conteudos',
      '/sites/exemplo-a/revisao',
      '/sites/exemplo-a/midia',
      '/sites/exemplo-a/autores',
      '/sites/exemplo-a/taxonomias',
      '/sites/exemplo-a/menus',
      '/sites/exemplo-a/institucionais',
    ]);
  });

  it('item global fica com o próprio caminho', () => {
    expect(navigationPath(navigationConfig[0]!, 'exemplo-a')).toBe('/sites');
  });
});

describe('activeNavigationKey', () => {
  it.each([
    ['/sites/x/autores', 'site.authors'],
    ['/sites/x/autores/novo', 'site.authors'],
    ['/sites/x/autores/3', 'site.authors'],
    ['/sites/x/conteudos/12/editar', 'site.contents'],
    ['/sites/x', 'site.overview'],
    ['/sites/x/configuracao', 'site.overview'],
    ['/sites/x/pendencias', 'site.overview'],
    ['/sites', 'sites'],
    ['/sites/novo', 'sites'],
  ])('%s → %s', (pathname, key) => {
    expect(activeNavigationKey(pathname)).toBe(key);
  });

  it('fora de /sites, ou numa área que não existe, nenhum item', () => {
    expect(activeNavigationKey('/teste-de-componentes')).toBeUndefined();
    expect(activeNavigationKey('/sites/x/inexistente')).toBeUndefined();
  });
});

describe('tipos', () => {
  it('authority só aceita Action de rbac.ts; icon, só chave do mapa de ícones', () => {
    // @ts-expect-error permissão fora de `Action`
    const semPermissao: NavigationTree = { ...item('a', []), authority: ['site.delete'] };
    // @ts-expect-error ícone sem entrada em navigation-icon.config.tsx
    const semIcone: NavigationTree = { ...item('b', []), icon: 'dashboard' };
    expect([semPermissao.key, semIcone.key]).toEqual(['a', 'b']);
  });
});
