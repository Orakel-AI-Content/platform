import type { Author, Content, Media, Redirect, Taxonomy } from '@orakel/content-model/v1';

import type {
  authors,
  contentVersions,
  media,
  mediaVariants,
  redirects,
  taxonomies,
} from '../../db/schema/index.ts';

// Linhas do banco → entidades do content-model. Colunas nulas viram campos ausentes: o
// contrato usa `optional`, nunca `null`.

type Row<T extends { $inferSelect: unknown }> = T['$inferSelect'];

function omitNulls<T extends Record<string, unknown>>(
  value: T,
): { [K in keyof T]: Exclude<T[K], null> } {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null)) as {
    [K in keyof T]: Exclude<T[K], null>;
  };
}

export function toAuthor(row: Row<typeof authors>): Author {
  const { id, slug, name, bio, expertise, avatarMediaId } = row;
  return omitNulls({ id, slug, name, bio, expertise, avatarMediaId });
}

export function toTaxonomy(row: Row<typeof taxonomies>): Taxonomy {
  const { id, kind, slug, name, description } = row;
  return omitNulls({ id, kind, slug, name, description });
}

export function toMedia(row: Row<typeof media>, variants: Row<typeof mediaVariants>[]): Media {
  return {
    id: row.id,
    width: row.width,
    height: row.height,
    variants: variants.map(({ width, format, path }) => ({ width, format, path })),
  };
}

export function toRedirect(row: Row<typeof redirects>): Redirect {
  return {
    id: row.id,
    from: row.from,
    to: row.to,
    status: row.status as Redirect['status'],
    origin: row.origin,
  };
}

export function toContent(row: Pick<Row<typeof contentVersions>, 'contentId' | 'data'>): Content {
  return { id: row.contentId, ...row.data };
}
