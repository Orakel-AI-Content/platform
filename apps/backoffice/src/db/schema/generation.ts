import { integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

import { sites } from './sites.ts';

/**
 * Contexto editorial do site para a geração (RN-GEN-05): só de inserção, uma versão por
 * gravação (N+1), como `site_configs`. Cada execução de geração aponta a versão usada.
 * Não vai para o site: fora do snapshot, sem mudança pendente.
 */
export const editorialContexts = pgTable(
  'editorial_contexts',
  {
    siteId: text()
      .notNull()
      .references(() => sites.id),
    version: integer().notNull(),
    body: text().notNull(),
    /** E-mail de quem criou. */
    createdBy: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.version] })],
);
