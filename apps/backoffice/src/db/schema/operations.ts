import { integer, pgTable, primaryKey, serial, text, timestamp } from 'drizzle-orm/pg-core';

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
