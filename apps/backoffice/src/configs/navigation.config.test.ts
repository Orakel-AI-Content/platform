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

/** Grupos (`title`) da árvore, cada um com os títulos dos seus itens. */
const siteGroups = (tree: NavigationTree[]) =>
  tree
    .filter((nav) => nav.type === NAV_ITEM_TYPE_TITLE)
    .map((nav) => [nav.title, nav.subMenu.map((area) => area.title)]);

/** Grupos e áreas que todo papel vê (site.read); os outros entram por permissão. */
const groups = ({ configure = false, write = false } = {}) => [
  ['Site', ['Visão geral', ...(configure ? ['Configuração do site'] : []), 'Mudanças pendentes']],
  ['Conteúdo', ['Conteúdos', 'Revisão', 'Mídia']],
  ['Estrutura', ['Autores', 'Taxonomias', 'Menus', ...(write ? ['Textos institucionais'] : [])]],
  ['Geração', ['Contextos editoriais', 'Geração']],
  ['Análise', ['Audiência']],
];

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
  it('as áreas do site vêm em cinco grupos com título, na ordem', () => {
    const view = (role: Actor['roles'][number]) =>
      siteGroups(filterNavigation(navigationConfig, actor(role)));
    expect(view('admin')).toEqual(groups({ configure: true, write: true }));
    expect(view('operacao')).toEqual(groups({ configure: true }));
    expect(view('editor')).toEqual(groups({ write: true }));
    expect(view('revisor')).toEqual(groups());
  });

  it('sem site.read, nenhum grupo das áreas do site', () => {
    expect(siteGroups(filterNavigation(navigationConfig, { email: 'x', roles: [] }))).toEqual([]);
  });

  it('"Sites" aparece para todos os papéis', () => {
    for (const role of ['admin', 'editor', 'revisor', 'operacao'] as const) {
      expect(filterNavigation(navigationConfig, actor(role))[0]?.title).toBe('Sites');
    }
  });

  it('"Releases" aparece só para admin e operacao (release.promote)', () => {
    const globais = (role: Actor['roles'][number]) =>
      filterNavigation(navigationConfig, actor(role))
        .filter((nav) => nav.type === NAV_ITEM_TYPE_ITEM)
        .map((nav) => nav.title);
    expect(globais('admin')).toEqual(['Sites', 'Releases']);
    expect(globais('operacao')).toEqual(['Sites', 'Releases']);
    expect(globais('editor')).toEqual(['Sites']);
    expect(globais('revisor')).toEqual(['Sites']);
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
    const areas = navigationConfig.flatMap((nav) =>
      nav.type === NAV_ITEM_TYPE_TITLE ? nav.subMenu : [],
    );
    expect(areas.map((nav) => navigationPath(nav, 'exemplo-a'))).toEqual([
      '/sites/exemplo-a',
      '/sites/exemplo-a/configuracao',
      '/sites/exemplo-a/pendencias',
      '/sites/exemplo-a/conteudos',
      '/sites/exemplo-a/revisao',
      '/sites/exemplo-a/midia',
      '/sites/exemplo-a/autores',
      '/sites/exemplo-a/taxonomias',
      '/sites/exemplo-a/menus',
      '/sites/exemplo-a/institucionais',
      '/sites/exemplo-a/contextos',
      '/sites/exemplo-a/geracao',
      '/sites/exemplo-a/audiencia',
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
    ['/sites/x/contextos', 'site.editorialContexts'],
    ['/sites/x/contextos/nova', 'site.editorialContexts'],
    ['/sites/x/geracao', 'site.generation'],
    ['/sites/x/audiencia', 'site.audience'],
    ['/sites/x', 'site.overview'],
    ['/sites/x/configuracao', 'site.config'],
    ['/sites/x/pendencias', 'site.pending'],
    ['/sites', 'sites'],
    ['/sites/novo', 'sites'],
    ['/releases', 'releases'],
    ['/releases/nova', 'releases'],
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
