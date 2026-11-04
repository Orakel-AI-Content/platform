import type { Issue } from '@orakel/content-model';
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

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

/** Estado da execução: nasce `pendente` e termina `ok` ou `falha`, sem nova tentativa (R4). */
export const GENERATION_STATUSES = ['pendente', 'ok', 'falha'] as const;
export type GenerationStatus = (typeof GENERATION_STATUSES)[number];

/**
 * Uma execução da geração básica (RN-CON-10, R5): o disparo (tema, autor, contexto vigente,
 * quem disparou) e o que a chamada ao modelo registrou. Operacional: fora do snapshot.
 * Prompt, provedor, tokens, custo e duração ficam nulos enquanto `pendente`; o custo também
 * fica nulo quando o modelo não está em `LLM_PRICING`.
 */
export const generationRuns = pgTable(
  'generation_runs',
  {
    id: serial().primaryKey(),
    siteId: text()
      .notNull()
      .references(() => sites.id),
    editorialContextVersion: integer().notNull(),
    topic: text().notNull(),
    /** Autor do artigo, no site. */
    authorId: integer().notNull(),
    /** E-mail de quem disparou. */
    createdBy: text().notNull(),
    status: text({ enum: GENERATION_STATUSES }).notNull().default('pendente'),
    /** Conteúdo criado pela rota interna, com a execução `ok`. */
    contentId: integer(),
    prompt: jsonb().$type<{ system: string; user: string }>(),
    provider: text(),
    model: text(),
    inputTokens: integer(),
    outputTokens: integer(),
    /** Em dólares. */
    costUsd: numeric({ precision: 12, scale: 6, mode: 'number' }),
    durationMs: integer(),
    /** Problemas da execução `falha`. */
    error: jsonb().$type<Issue[]>(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    foreignKey({
      name: 'generation_runs_editorial_context_fk',
      columns: [t.siteId, t.editorialContextVersion],
      foreignColumns: [editorialContexts.siteId, editorialContexts.version],
    }),
    index('generation_runs_site_created_idx').on(t.siteId, t.createdAt),
    check(
      'generation_runs_finished_check',
      sql`(${t.status} = 'pendente') = (${t.finishedAt} is null)`,
    ),
  ],
);
