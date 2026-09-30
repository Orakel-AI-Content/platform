// Mapa caminho → modelo da página, montado uma vez por site com as rotas do core (ADR 0004
// da unidade). O build estático enumera as chaves; o SSR consulta o mapa. Os dois usam a
// mesma tabela, o que sustenta a paridade estático × SSR.
import type { Author, Content, RichText, SiteConfig, Taxonomy } from '@orakel/content-model/v1';
import {
  SEARCH_PATH,
  authorPath,
  contentPath,
  homePath,
  institutionalPages,
  taxonomyPath,
  type InstitutionalKey,
} from '@orakel/core/v1';

import type { SiteData } from '../data/site-source.ts';

export const PAGE_SIZE = 10;

export type Listing = { items: Content[]; page: number; totalPages: number };

export type PageModel =
  | ({ type: 'home' } & Listing)
  | { type: 'content'; content: Content }
  | ({ type: 'taxonomy'; taxonomy: Taxonomy } & Listing)
  | ({ type: 'author'; author: Author } & Listing)
  | { type: 'institutional'; key: InstitutionalKey; title: string; text: RichText }
  | { type: 'search' }
  | { type: 'not-found' };

/** Mais recente primeiro; empate pelo ID, para a ordem ser estável. */
export function byNewest(a: Content, b: Content): number {
  return Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || b.id - a.id;
}

export function searchEnabled(config: Pick<SiteConfig, 'featureFlags'>): boolean {
  return config.featureFlags.busca === true;
}

function paginate(
  items: Content[],
  path: (page: number) => string,
  model: (listing: Listing) => PageModel,
): [string, PageModel][] {
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  return Array.from({ length: totalPages }, (_, index) => {
    const page = index + 1;
    const listing = {
      items: items.slice(index * PAGE_SIZE, page * PAGE_SIZE),
      page,
      totalPages,
    };
    return [path(page), model(listing)];
  });
}

const routes = new WeakMap<SiteData, Map<string, PageModel>>();

export function siteRoutes(site: SiteData): ReadonlyMap<string, PageModel> {
  const cached = routes.get(site);
  if (cached) return cached;

  const articles = site.contents.filter((content) => content.kind === 'article').sort(byNewest);
  const map = new Map<string, PageModel>([
    ...paginate(articles, homePath, (listing) => ({ type: 'home', ...listing })),
    ...site.contents.map((content): [string, PageModel] => [
      contentPath(content),
      { type: 'content', content },
    ]),
    ...site.taxonomies.flatMap((taxonomy) =>
      paginate(
        articles.filter((article) => article.taxonomyIds.includes(taxonomy.id)),
        (page) => taxonomyPath(taxonomy, page),
        (listing) => ({ type: 'taxonomy', taxonomy, ...listing }),
      ),
    ),
    ...site.authors.flatMap((author) =>
      paginate(
        articles.filter((article) => article.authorIds.includes(author.id)),
        (page) => authorPath(author, page),
        (listing) => ({ type: 'author', author, ...listing }),
      ),
    ),
    ...institutionalPages(site).flatMap(({ key, path, title }): [string, PageModel][] => {
      const text = site.config.institutionalTexts?.[key];
      return text ? [[path, { type: 'institutional', key, title, text }]] : [];
    }),
    ...(searchEnabled(site.config)
      ? [[SEARCH_PATH, { type: 'search' }] as [string, PageModel]]
      : []),
  ]);
  routes.set(site, map);
  return map;
}

export function resolvePath(site: SiteData, path: string): PageModel {
  return siteRoutes(site).get(path) ?? { type: 'not-found' };
}

/** Todos os caminhos do site, em ordem estável (getStaticPaths). */
export function enumeratePaths(site: SiteData): string[] {
  return [...siteRoutes(site).keys()].sort();
}
