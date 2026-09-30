// Dados estruturados (schema.org): Organization, Person, Article e BreadcrumbList, num
// @graph por página, ligados por @id (ADR 0007). Logo e perfis da Organization esperam
// campos na configuração do site.
import type { Author, Content, Snapshot } from '@orakel/content-model/v1';
import { authorPath, contentPath, homePath } from './routes.ts';
import { absoluteUrl, lookups, shareImage, siteOrigin } from './site.ts';

type Node = Record<string, unknown>;

/** Remove as chaves sem valor, para o JSON-LD não levar `undefined` nem listas vazias. */
function compact(node: Node): Node {
  return Object.fromEntries(
    Object.entries(node).filter(
      ([, value]) => value !== undefined && !(Array.isArray(value) && value.length === 0),
    ),
  );
}

export function organizationId(snapshot: Pick<Snapshot, 'config'>): string {
  return `${siteOrigin(snapshot.config)}/#organization`;
}

export function personId(snapshot: Pick<Snapshot, 'config'>, author: Pick<Author, 'slug'>): string {
  return `${absoluteUrl(snapshot.config, authorPath(author))}#person`;
}

export function organizationNode(snapshot: Pick<Snapshot, 'config'>): Node {
  return {
    '@type': 'Organization',
    '@id': organizationId(snapshot),
    name: snapshot.config.name,
    url: absoluteUrl(snapshot.config, homePath()),
  };
}

export function personNode(snapshot: Snapshot, author: Author): Node {
  const avatar =
    author.avatarMediaId === undefined
      ? undefined
      : lookups(snapshot).media.get(author.avatarMediaId);
  return compact({
    '@type': 'Person',
    '@id': personId(snapshot, author),
    name: author.name,
    url: absoluteUrl(snapshot.config, authorPath(author)),
    description: author.bio,
    image: avatar && shareImage(snapshot.config, avatar)?.url,
    knowsAbout: author.expertise,
  });
}

export function articleNode(snapshot: Snapshot, content: Content): Node {
  const { media } = lookups(snapshot);
  const url = absoluteUrl(snapshot.config, contentPath(content));
  const cover = content.coverMediaId === undefined ? undefined : media.get(content.coverMediaId);
  const authors = contentAuthors(snapshot, content);
  return compact({
    '@type': 'Article',
    '@id': `${url}#article`,
    headline: content.title,
    description: content.seo?.description ?? content.description,
    datePublished: content.publishedAt,
    dateModified: content.updatedAt ?? content.publishedAt,
    inLanguage: snapshot.config.language,
    mainEntityOfPage: url,
    image: cover && [shareImage(snapshot.config, cover)?.url].filter(Boolean),
    author: authors.map((author) => ({ '@id': personId(snapshot, author) })),
    publisher: { '@id': organizationId(snapshot) },
  });
}

export type Crumb = { name: string; path: string };

export function breadcrumbNode(snapshot: Pick<Snapshot, 'config'>, crumbs: readonly Crumb[]): Node {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(snapshot.config, crumb.path),
    })),
  };
}

export function graph(nodes: readonly Node[]): Node {
  return { '@context': 'https://schema.org', '@graph': nodes };
}

/** Autores do conteúdo, na ordem de `authorIds`, ignorando IDs sem autor no snapshot. */
export function contentAuthors(snapshot: Snapshot, content: Content): Author[] {
  const { author } = lookups(snapshot);
  return content.authorIds.flatMap((id) => author.get(id) ?? []);
}
