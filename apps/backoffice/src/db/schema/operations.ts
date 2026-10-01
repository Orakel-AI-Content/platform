import { index, integer, pgTable, primaryKey, serial, text, timestamp } from 'drizzle-orm/pg-core';

import { sites } from './sites.ts';

/**
 * Mudança pendente: toda gravação num dado que a API de exportação entrega a um site cria
 * uma, na mesma transação. O build baixa pela lista de IDs visíveis no snapshot.
 */
export const pendingChanges = pgTable('pending_changes', {
  id: serial().primaryKey(),
  siteId: text()
    .notNull()
    .references(() => sites.id),
  origin: text().notNull(),
  reference: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  /** Preenchido quando um build bem-sucedido inclui a mudança. */
  resolvedAt: timestamp({ withTimezone: true }),
});

export const BUILD_STATUSES = ['ok', 'failed'] as const;
export const BUILD_STAGES = ['image', 'render', 'publish'] as const;
export const FAILURE_KINDS = ['permanent', 'transient'] as const;

/**
 * Uma execução da task `build` (12.0, L3): cada tentativa vira uma linha. A de sucesso mais
 * recente é a versão ativa do site — referência da trava de segurança e do rollback (L4).
 */
export const builds = pgTable(
  'builds',
  {
    id: serial().primaryKey(),
    siteId: text()
      .notNull()
      .references(() => sites.id),
    /** Release do core usada (tag da imagem site-builder). */
    release: text().notNull(),
    /** Job do Graphile Worker e tentativa (1 a 5). */
    jobId: text(),
    attempt: integer().notNull(),
    status: text({ enum: BUILD_STATUSES }).notNull(),
    /** Etapa em que falhou. */
    failedStage: text({ enum: BUILD_STAGES }),
    failureKind: text({ enum: FAILURE_KINDS }),
    failureMessage: text(),
    /** Mudanças pendentes incluídas (as que o snapshot viu). */
    pendingChangeIds: integer().array().notNull().default([]),
    pages: integer(),
    files: integer(),
    /** Versão publicada no alvo (Worker na Cloudflare ou edge-local). */
    versionId: text(),
    /** Objeto do bucket build-cache com a saída compactada. */
    cacheKey: text(),
    renderMs: integer(),
    publishMs: integer(),
    startedAt: timestamp({ withTimezone: true }).notNull(),
    finishedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.siteId, t.finishedAt)],
);

export const ROLES = ['admin', 'editor', 'revisor', 'operacao'] as const;
export type Role = (typeof ROLES)[number];

/** Pessoas do Backoffice, identificadas pelo e-mail do JWT do Access. */
export const users = pgTable('users', {
  id: serial().primaryKey(),
  email: text().notNull().unique(),
  name: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const userRoles = pgTable(
  'user_roles',
  {
    userId: integer()
      .notNull()
      .references(() => users.id),
    role: text({ enum: ROLES }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
);
