// Fonte única das rotas dos sites (ADR 0003): o blog usa nos links e no getStaticPaths, e
// canonical, breadcrumb, sitemap, RSS e o manifesto de eventos usam os mesmos caminhos.
// Toda rota termina com "/" (auto-trailing-slash); a página 1 não tem sufixo.
import type { Author, Content, SiteConfig, Snapshot, Taxonomy } from '@orakel/content-model/v1';
import type { Issue } from '../result.ts';

export type InstitutionalKey = keyof NonNullable<SiteConfig['institutionalTexts']>;

/** Páginas institucionais: texto na configuração do site, caminho fixo. */
export const INSTITUTIONAL_PAGES: Readonly<
  Record<InstitutionalKey, { path: string; title: string }>
> = {
  about: { path: '/sobre/', title: 'Sobre' },
  contact: { path: '/contato/', title: 'Contato' },
  terms: { path: '/termos/', title: 'Termos de uso' },
  privacy: { path: '/privacidade/', title: 'Política de privacidade' },
  editorialPolicy: { path: '/politica-editorial/', title: 'Política editorial' },
};

export const SEARCH_PATH = '/busca/';

const PAGE_SEGMENT = 'pagina';
const AUTHOR_SEGMENT = 'autor';
export const TAXONOMY_SEGMENTS: Readonly<Record<Taxonomy['kind'], string>> = {
  category: 'categoria',
  tag: 'tag',
  series: 'serie',
};

/** Primeiros segmentos que um slug de conteúdo não pode usar. */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  PAGE_SEGMENT,
  AUTHOR_SEGMENT,
  ...Object.values(TAXONOMY_SEGMENTS),
  SEARCH_PATH.slice(1, -1),
  ...Object.values(INSTITUTIONAL_PAGES).map((page) => page.path.slice(1, -1)),
  '404',
  'pagefind',
  'fonts',
]);

function paged(base: string, page = 1): string {
  if (!Number.isInteger(page) || page < 1) throw new RangeError(`Página inválida: ${page}`);
  return page === 1 ? base : `${base}${PAGE_SEGMENT}/${page}/`;
}

export function homePath(page?: number): string {
  return paged('/', page);
}

export function contentPath(content: Pick<Content, 'slug'>): string {
  return `/${content.slug}/`;
}

export function taxonomyPath(taxonomy: Pick<Taxonomy, 'kind' | 'slug'>, page?: number): string {
  return paged(`/${TAXONOMY_SEGMENTS[taxonomy.kind]}/${taxonomy.slug}/`, page);
}

export function authorPath(author: Pick<Author, 'slug'>, page?: number): string {
  return paged(`/${AUTHOR_SEGMENT}/${author.slug}/`, page);
}

/** Institucionais com texto definido na configuração: só essas viram página. */
export function institutionalPages(
  snapshot: Pick<Snapshot, 'config'>,
): { key: InstitutionalKey; path: string; title: string }[] {
  const texts = snapshot.config.institutionalTexts ?? {};
  return (Object.keys(INSTITUTIONAL_PAGES) as InstitutionalKey[])
    .filter((key) => texts[key] !== undefined)
    .map((key) => ({ key, ...INSTITUTIONAL_PAGES[key] }));
}

const withSlash = (path: string) => (path.endsWith('/') ? path : `${path}/`);

/**
 * Colisões que deixariam uma URL com duas fontes, ou um conteúdo inalcançável: slug
 * reservado (segmento de rota ou institucional) e redirect cuja origem é uma página viva.
 * O render trata como falha permanente.
 */
export function routeConflicts(snapshot: Pick<Snapshot, 'contents' | 'redirects'>): Issue[] {
  const issues: Issue[] = [];
  const pages = new Map<string, number>();
  snapshot.contents.forEach((content, index) => {
    pages.set(contentPath(content), index);
    if (RESERVED_SLUGS.has(content.slug)) {
      issues.push({
        code: 'route.reserved-slug',
        message: `O slug "${content.slug}" é reservado (${contentPath(content)} é rota da plataforma)`,
        path: ['contents', index, 'slug'],
      });
    }
  });
  snapshot.redirects.forEach((redirect, index) => {
    const page = pages.get(withSlash(redirect.from));
    if (page !== undefined) {
      issues.push({
        code: 'route.redirect-shadows-page',
        message: `O redirect de ${redirect.from} esconde o conteúdo publicado em ${withSlash(redirect.from)}`,
        path: ['redirects', index, 'from'],
      });
    }
  });
  return issues;
}
