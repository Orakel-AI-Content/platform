// Tags do <head> de cada tipo de página: title, description, canonical, robots, Open Graph e
// o JSON-LD (ADR 0004). O blog renderiza com `renderHead` de "@orakel/core".
import type { Author, Content, Snapshot, Taxonomy } from '@orakel/content-model/v1';
import type { HeadTag } from '../head.ts';
import {
  articleNode,
  breadcrumbNode,
  contentAuthors,
  graph,
  organizationNode,
  personNode,
  type Crumb,
} from './json-ld.ts';
import {
  INSTITUTIONAL_PAGES,
  SEARCH_PATH,
  authorPath,
  contentPath,
  homePath,
  taxonomyPath,
  type InstitutionalKey,
} from './routes.ts';
import { absoluteUrl, lookups, shareImage, type ShareImage } from './site.ts';

export type SeoPage =
  | { type: 'home'; page?: number }
  | { type: 'content'; content: Content }
  | { type: 'taxonomy'; taxonomy: Taxonomy; page?: number }
  | { type: 'author'; author: Author; page?: number }
  | { type: 'institutional'; key: InstitutionalKey }
  | { type: 'search' };

type PageSeo = {
  title: string;
  description?: string | undefined;
  path: string;
  canonical?: string | undefined;
  ogType: 'website' | 'article' | 'profile';
  image?: ShareImage | undefined;
  noindex?: boolean;
  articleTimes?: { published: string; modified: string };
  nodes: Record<string, unknown>[];
};

const HOME_CRUMB_NAME = 'Início';

function pagedTitle(title: string, page = 1): string {
  return page > 1 ? `${title} — Página ${page}` : title;
}

function crumbs(...items: Crumb[]): Crumb[] {
  return [{ name: HOME_CRUMB_NAME, path: homePath() }, ...items];
}

function describe(page: SeoPage, snapshot: Snapshot): PageSeo {
  const site = snapshot.config.name;
  const withSite = (title: string) => `${title} | ${site}`;

  switch (page.type) {
    case 'home':
      return {
        title: pagedTitle(site, page.page),
        path: homePath(page.page),
        ogType: 'website',
        nodes: [organizationNode(snapshot)],
      };

    case 'content': {
      const { content } = page;
      const path = contentPath(content);
      const { media, taxonomy } = lookups(snapshot);
      const cover =
        content.coverMediaId === undefined ? undefined : media.get(content.coverMediaId);
      const category = content.taxonomyIds
        .map((id) => taxonomy.get(id))
        .find((item) => item?.kind === 'category');
      const trail = crumbs(
        ...(category ? [{ name: category.name, path: taxonomyPath(category) }] : []),
        { name: content.title, path },
      );
      const isArticle = content.kind === 'article';
      return {
        title: content.seo?.title ?? withSite(content.title),
        description: content.seo?.description ?? content.description,
        path,
        canonical: content.seo?.canonical,
        ogType: isArticle ? 'article' : 'website',
        image: cover && shareImage(snapshot.config, cover),
        ...(isArticle && {
          articleTimes: {
            published: content.publishedAt,
            modified: content.updatedAt ?? content.publishedAt,
          },
        }),
        nodes: isArticle
          ? [
              articleNode(snapshot, content),
              ...contentAuthors(snapshot, content).map((author) => personNode(snapshot, author)),
              organizationNode(snapshot),
              breadcrumbNode(snapshot, trail),
            ]
          : [breadcrumbNode(snapshot, trail)],
      };
    }

    case 'taxonomy': {
      const path = taxonomyPath(page.taxonomy, page.page);
      return {
        title: withSite(pagedTitle(page.taxonomy.name, page.page)),
        description: page.taxonomy.description,
        path,
        ogType: 'website',
        nodes: [breadcrumbNode(snapshot, crumbs({ name: page.taxonomy.name, path }))],
      };
    }

    case 'author': {
      const path = authorPath(page.author, page.page);
      return {
        title: withSite(pagedTitle(page.author.name, page.page)),
        description: page.author.bio,
        path,
        ogType: 'profile',
        nodes: [
          personNode(snapshot, page.author),
          breadcrumbNode(snapshot, crumbs({ name: page.author.name, path })),
        ],
      };
    }

    case 'institutional': {
      const { path, title } = INSTITUTIONAL_PAGES[page.key];
      return {
        title: withSite(title),
        path,
        ogType: 'website',
        nodes: [breadcrumbNode(snapshot, crumbs({ name: title, path }))],
      };
    }

    case 'search':
      // Resultado de busca interna não é página de destino: fica fora do índice.
      return {
        title: withSite('Busca'),
        path: SEARCH_PATH,
        ogType: 'website',
        noindex: true,
        nodes: [],
      };
  }
}

/** `pt-BR` → `pt_BR` (formato do og:locale). */
const ogLocale = (language: string) => language.replace('-', '_');

export function seoHead(page: SeoPage, snapshot: Snapshot): HeadTag[] {
  const seo = describe(page, snapshot);
  const { config } = snapshot;
  const url = absoluteUrl(config, seo.path);
  const meta = (attrs: Record<string, string>): HeadTag => ({ tag: 'meta', attrs });
  const property = (name: string, content: string) => meta({ property: name, content });

  const tags: HeadTag[] = [{ tag: 'title', text: seo.title }];
  if (seo.description) tags.push(meta({ name: 'description', content: seo.description }));
  tags.push({
    tag: 'link',
    attrs: { rel: 'canonical', href: absoluteUrl(config, seo.canonical ?? seo.path) },
  });
  // O _headers já manda noindex quando o site não é indexável; a meta repete para o SSR.
  if (seo.noindex || !config.indexavel) tags.push(meta({ name: 'robots', content: 'noindex' }));

  tags.push(
    property('og:site_name', config.name),
    property('og:title', seo.title),
    property('og:type', seo.ogType),
    property('og:url', url),
    property('og:locale', ogLocale(config.language)),
  );
  if (seo.description) tags.push(property('og:description', seo.description));
  if (seo.image) {
    tags.push(
      property('og:image', seo.image.url),
      property('og:image:width', String(seo.image.width)),
      property('og:image:height', String(seo.image.height)),
    );
  }
  if (seo.articleTimes) {
    tags.push(
      property('article:published_time', seo.articleTimes.published),
      property('article:modified_time', seo.articleTimes.modified),
    );
  }
  tags.push(meta({ name: 'twitter:card', content: seo.image ? 'summary_large_image' : 'summary' }));

  if (seo.nodes.length > 0) tags.push({ tag: 'jsonld', data: graph(seo.nodes) });
  return tags;
}
