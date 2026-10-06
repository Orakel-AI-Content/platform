import type { Content, Menu } from '@orakel/content-model/v1';
import { integer, jsonb, pgTable, primaryKey, text, timestamp, unique } from 'drizzle-orm/pg-core';

import { sites } from './sites.ts';

// Tudo pertence a um único site: chave (site_id, id), com IDs alocados por site.

const siteId = () =>
  text()
    .notNull()
    .references(() => sites.id);

export const authors = pgTable(
  'authors',
  {
    siteId: siteId(),
    id: integer().notNull(),
    slug: text().notNull(),
    name: text().notNull(),
    bio: text(),
    expertise: text(),
    avatarMediaId: integer(),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.id] }), unique().on(t.siteId, t.slug)],
);

export const taxonomies = pgTable(
  'taxonomies',
  {
    siteId: siteId(),
    id: integer().notNull(),
    kind: text({ enum: ['category', 'tag', 'series'] }).notNull(),
    slug: text().notNull(),
    name: text().notNull(),
    description: text(),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.id] }), unique().on(t.siteId, t.kind, t.slug)],
);

export const menus = pgTable(
  'menus',
  {
    siteId: siteId(),
    id: integer().notNull(),
    key: text().notNull(),
    items: jsonb().$type<Menu['items']>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.id] }), unique().on(t.siteId, t.key)],
);

export const media = pgTable(
  'media',
  {
    siteId: siteId(),
    id: integer().notNull(),
    width: integer().notNull(),
    height: integer().notNull(),
    /** Original normalizado em `media-originals` (`<site>/<sha256>.<ext>`); só operacional,
     * fora do snapshot. Nulo nas mídias importadas, que não têm original guardado. */
    originalKey: text(),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.id] })],
);

export const mediaVariants = pgTable(
  'media_variants',
  {
    siteId: siteId(),
    mediaId: integer().notNull(),
    width: integer().notNull(),
    format: text().notNull(),
    path: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.mediaId, t.width, t.format] })],
);

export const redirects = pgTable(
  'redirects',
  {
    siteId: siteId(),
    id: integer().notNull(),
    from: text().notNull(),
    to: text().notNull(),
    status: integer().notNull(),
    origin: text({ enum: ['manual', 'slug-change'] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.id] }), unique().on(t.siteId, t.from)],
);

export const contents = pgTable(
  'contents',
  {
    siteId: siteId(),
    /** ID numérico estável; o slug fica na versão e pode mudar. */
    id: integer().notNull(),
    kind: text({ enum: ['article', 'page'] }).notNull(),
    /** Próximo número de bloco: atribuído pelo servidor, nunca reutilizado. */
    nextBlockN: integer().notNull().default(1),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.id] })],
);

export const CONTENT_STATUSES = [
  'rascunho',
  'em_revisao',
  'aprovado',
  'agendado',
  'publicado',
  'despublicado',
] as const;

/** Dados de uma versão: o conteúdo do content-model, sem o ID (que é do conteúdo). */
export type ContentData = Omit<Content, 'id'>;

/** Versões imutáveis; a publicada mais recente é a que vai para o site. */
export const contentVersions = pgTable(
  'content_versions',
  {
    siteId: siteId(),
    contentId: integer().notNull(),
    version: integer().notNull(),
    status: text({ enum: CONTENT_STATUSES }).notNull(),
    data: jsonb().$type<ContentData>().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.contentId, t.version] })],
);
