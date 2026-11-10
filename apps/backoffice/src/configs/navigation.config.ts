// Ecme v1.3.10 (e5f9a1d): src/@types/navigation.ts, src/constants/navigation.constant.ts,
// src/configs/navigation.config/index.ts e src/utils/hooks/useAuthority.ts
// Adaptado (#236; workspace#46): a navegação do Backoffice numa árvore tipada, sem React nem
// Next, para o layout do admin filtrar no servidor e a barra marcar o item pelo pathname.
// - `authority` é uma lista de permissões (`Action` de `rbac.ts`) conferida por `can()`, não
//   de papéis; como no `useAuthority` do Ecme, lista vazia é visível e basta uma;
// - sem `translateKey` (não há i18n), `meta.horizontalMenu` (não há barra no topo) e o tipo
//   `collapse` (não há submenus, #235);
// - as áreas do site levam o marcador `[site]` no caminho, trocado por `navigationPath`, e ficam
//   em grupos com título (`title`: Site, Conteúdo, Estrutura, Geração e Análise, #582), todos
//   no mesmo `nav "Áreas do site"`;
// - o item ativo sai do pathname (`activeNavigationKey`), pelo primeiro segmento depois do site.
import { can, type Action, type Actor } from '../domain/access/rbac.ts';
import type { NavigationIconKey } from './navigation-icon.config.tsx';

export const NAV_ITEM_TYPE_TITLE = 'title';
export const NAV_ITEM_TYPE_ITEM = 'item';

export interface NavigationTree {
  key: string;
  path: string;
  isExternalLink?: boolean;
  title: string;
  icon: NavigationIconKey;
  type: typeof NAV_ITEM_TYPE_TITLE | typeof NAV_ITEM_TYPE_ITEM;
  /** Permissões que mostram o item: vazia, para todos; senão, basta uma (`can()`). */
  authority: Action[];
  subMenu: NavigationTree[];
  description?: string;
}

/** Marcador do site no `path` das áreas do site, trocado por `navigationPath`. */
export const SITE_PARAM = '[site]';

const SITE_PREFIX = `/sites/${SITE_PARAM}`;

/** Área do site: `segment` é o primeiro segmento depois de `/sites/<site>/` ('' = Visão geral). */
function siteArea(
  key: string,
  segment: string,
  title: string,
  icon: NavigationIconKey,
  authority: Action[] = ['site.read'],
): NavigationTree {
  return {
    key,
    path: segment === '' ? SITE_PREFIX : `${SITE_PREFIX}/${segment}`,
    title,
    icon,
    type: NAV_ITEM_TYPE_ITEM,
    authority,
    subMenu: [],
  };
}

/** Grupo com título das áreas do site: some, na `filterNavigation`, se nenhum item ficar. */
function siteGroup(key: string, title: string, subMenu: NavigationTree[]): NavigationTree {
  return {
    key,
    path: '',
    title,
    icon: subMenu[0]?.icon ?? 'siteOverview',
    type: NAV_ITEM_TYPE_TITLE,
    authority: ['site.read'],
    subMenu,
  };
}

const navigationConfig: NavigationTree[] = [
  {
    key: 'sites',
    path: '/sites',
    title: 'Sites',
    icon: 'sites',
    type: NAV_ITEM_TYPE_ITEM,
    authority: ['site.read'],
    subMenu: [],
  },
  // Registro de versões do site-builder (#509): só para quem promove release (admin e operação).
  {
    key: 'releases',
    path: '/releases',
    title: 'Releases',
    icon: 'releases',
    type: NAV_ITEM_TYPE_ITEM,
    authority: ['release.promote'],
    subMenu: [],
  },
  // Áreas do site em grupos (#582). Configuração e Mudanças pendentes com a permissão da tela.
  siteGroup('site.group.site', 'Site', [
    siteArea('site.overview', '', 'Visão geral', 'siteOverview'),
    siteArea('site.config', 'configuracao', 'Configuração do site', 'siteConfig', [
      'site.configure',
    ]),
    siteArea('site.pending', 'pendencias', 'Mudanças pendentes', 'sitePending'),
  ]),
  siteGroup('site.group.content', 'Conteúdo', [
    siteArea('site.contents', 'conteudos', 'Conteúdos', 'siteContents'),
    siteArea('site.review', 'revisao', 'Revisão', 'siteReview'),
    siteArea('site.media', 'midia', 'Mídia', 'siteMedia'),
  ]),
  siteGroup('site.group.structure', 'Estrutura', [
    siteArea('site.authors', 'autores', 'Autores', 'siteAuthors'),
    siteArea('site.taxonomies', 'taxonomias', 'Taxonomias', 'siteTaxonomies'),
    siteArea('site.menus', 'menus', 'Menus', 'siteMenus'),
    // Só para quem edita: a tela é um formulário.
    siteArea('site.institutional', 'institucionais', 'Textos institucionais', 'siteInstitutional', [
      'content.write',
    ]),
  ]),
  siteGroup('site.group.generation', 'Geração', [
    // Versões do contexto editorial da geração (RN-GEN-05): ler é site.read; criar, content.write.
    siteArea(
      'site.editorialContexts',
      'contextos',
      'Contextos editoriais',
      'siteEditorialContexts',
    ),
    // Disparo e acompanhamento da geração (R1, R5): ver é site.read; disparar, content.write.
    siteArea('site.generation', 'geracao', 'Geração', 'siteGeneration'),
  ]),
  siteGroup('site.group.analytics', 'Análise', [
    // Visualizações e sessões por dia, das tabelas diárias consolidadas (#548).
    siteArea('site.audience', 'audiencia', 'Audiência', 'siteAudience'),
  ]),
];

export default navigationConfig;

/** Lista vazia mostra o item; senão, basta uma das permissões. */
function isAuthorized(actor: Actor, authority: readonly Action[]): boolean {
  return authority.length === 0 || authority.some((action) => can(actor, action));
}

/**
 * Árvore só com o que o `actor` pode ver: tira os itens sem permissão e os grupos (`title`)
 * que ficam sem itens.
 */
export function filterNavigation(tree: readonly NavigationTree[], actor: Actor): NavigationTree[] {
  return tree.flatMap((nav) => {
    if (!isAuthorized(actor, nav.authority)) return [];
    if (nav.type !== NAV_ITEM_TYPE_TITLE) return [nav];
    const subMenu = filterNavigation(nav.subMenu, actor);
    return subMenu.length > 0 ? [{ ...nav, subMenu }] : [];
  });
}

/** Caminho do item para o site (`[site]` → o id); o dos itens globais fica igual. */
export function navigationPath(nav: Pick<NavigationTree, 'path'>, siteId: string): string {
  return nav.path.replace(SITE_PARAM, encodeURIComponent(siteId));
}

/** Segmento de cada área do site ('' = Visão geral), pela `key`. */
function areaSegment(nav: NavigationTree): string {
  return nav.path === SITE_PREFIX ? '' : nav.path.slice(SITE_PREFIX.length + 1);
}

/**
 * `key` do item ativo para o pathname: em `/sites/<site>/…`, a área pelo primeiro segmento
 * (também nas telas de item, criar e editar); fora dele, em `/sites` e abaixo, "Sites"; em
 * `/releases` e abaixo, "Releases".
 */
export function activeNavigationKey(
  pathname: string,
  tree: readonly NavigationTree[] = navigationConfig,
): string | undefined {
  const parts = pathname.split('/');
  if (parts[1] === 'releases') return 'releases';
  if (parts[1] !== 'sites') return undefined;
  const site = parts[2];
  // `/sites/novo` é a tela de criar site: a rota estática vence o `[site]` no Next.
  if (site === undefined || site === '' || site === 'novo') return 'sites';
  const target = parts[3] ?? '';
  const areas = tree.flatMap((nav) => (nav.type === NAV_ITEM_TYPE_TITLE ? nav.subMenu : [nav]));
  return areas.find((nav) => nav.path.startsWith(SITE_PREFIX) && areaSegment(nav) === target)?.key;
}
