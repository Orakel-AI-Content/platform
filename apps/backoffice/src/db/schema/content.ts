import type { Content, Menu } from '@orakel/content-model/v1';
import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

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

/** Estado de um envio de mídia: o worker o fecha como `pronta` ou `recusada` (#185). */
export const UPLOAD_STATUSES = ['processando', 'pronta', 'recusada'] as const;

/**
 * Envios de mídia (#184): operacional, fora do snapshot e sem `recordPendingChange`. Fonte do
 * nome original e da data de envio; a chave é a do objeto em `media-originals/uploads/`.
 */
export const mediaUploads = pgTable(
  'media_uploads',
  {
    uploadKey: text().primaryKey(),
    siteId: siteId(),
    originalName: text().notNull(),
    status: text({ enum: UPLOAD_STATUSES }).notNull().default('processando'),
    /** Motivo da recusa, quando `recusada`. */
    reason: text(),
    /** Mídia gerada, quando `pronta`. */
    mediaId: integer(),
    uploadedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('media_uploads_site_uploaded_at_idx').on(t.siteId, t.uploadedAt)],
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

/**
 * Versões com dados imutáveis; só o `status` muda (ADR 0015). A mais recente entre
 * `publicado` e `despublicado` é a que vai para o site, se for `publicado` (`LIVE_STATUSES`,
 * ADR 0017).
 */
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

/**
 * Revisões das versões: quem aprovou, qual versão, o checklist marcado e quando. Uma linha
 * por ação; a aprovação também leva a versão a `aprovado` (ADR 0015).
 */
export const reviews = pgTable('reviews', {
  id: serial().primaryKey(),
  siteId: siteId(),
  contentId: integer().notNull(),
  version: integer().notNull(),
  /** E-mail de quem revisou. */
  reviewer: text().notNull(),
  /** Chaves de `REVIEW_CHECKLIST` marcadas. */
  checklist: jsonb().$type<string[]>().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/**
 * Publicações (workspace#20): uma linha por ação de publicar, com quem e quando. Operacional,
 * fora do snapshot; é a base da contagem do limite diário do site (dia de America/Sao_Paulo).
 */
export const publications = pgTable(
  'publications',
  {
    id: serial().primaryKey(),
    siteId: siteId(),
    contentId: integer().notNull(),
    version: integer().notNull(),
    /** E-mail de quem publicou. */
    publishedBy: text().notNull(),
    publishedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Horário marcado, quando a publicação veio de um agendamento (Task do agendamento). */
    scheduledFor: timestamp({ withTimezone: true }),
  },
  (t) => [index('publications_site_published_at_idx').on(t.siteId, t.publishedAt)],
);
