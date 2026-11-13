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

import { contentVersions, reviews } from './content.ts';
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
 * Tipo da execução: `geracao` cria um artigo a partir de um tema (RN-CON-10); `correcao`
 * corrige a versão devolvida pelo revisor, pedida na devolução (ADR 0023).
 */
export const GENERATION_KINDS = ['geracao', 'correcao'] as const;
export type GenerationKind = (typeof GENERATION_KINDS)[number];

/**
 * Uma execução que chama o modelo (RN-CON-10, R5): o disparo e o que a chamada registrou.
 * Na `geracao`: tema, autor e contexto vigente; na `correcao`: o conteúdo, a versão-base (a
 * devolvida) e a revisão `devolvido` que a pediu, com o contexto vigente se houver. Um CHECK
 * por tipo garante as colunas de cada um. Operacional: fora do snapshot. Prompt, provedor,
 * tokens, custo e duração ficam nulos enquanto `pendente`; o custo também fica nulo quando o
 * modelo não está em `LLM_PRICING`.
 */
export const generationRuns = pgTable(
  'generation_runs',
  {
    id: serial().primaryKey(),
    siteId: text()
      .notNull()
      .references(() => sites.id),
    kind: text({ enum: GENERATION_KINDS }).notNull().default('geracao'),
    /** Obrigatória na `geracao`; na `correcao`, a vigente no pedido, se houver. */
    editorialContextVersion: integer(),
    /** Só na `geracao`. */
    topic: text(),
    /** Autor do artigo, no site. Só na `geracao`. */
    authorId: integer(),
    /** E-mail de quem disparou. */
    createdBy: text().notNull(),
    status: text({ enum: GENERATION_STATUSES }).notNull().default('pendente'),
    /**
     * Na `geracao`, o conteúdo criado pela rota interna, com a execução `ok`; na `correcao`,
     * o conteúdo corrigido, desde o pedido.
     */
    contentId: integer(),
    /** Versão devolvida que a `correcao` corrige. */
    baseVersion: integer(),
    /** Revisão `devolvido` que pediu a `correcao`. */
    reviewId: integer().references(() => reviews.id),
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
    foreignKey({
      name: 'generation_runs_base_version_fk',
      columns: [t.siteId, t.contentId, t.baseVersion],
      foreignColumns: [contentVersions.siteId, contentVersions.contentId, contentVersions.version],
    }),
    index('generation_runs_site_created_idx').on(t.siteId, t.createdAt),
    check(
      'generation_runs_finished_check',
      sql`(${t.status} = 'pendente') = (${t.finishedAt} is null)`,
    ),
    check(
      'generation_runs_geracao_check',
      sql`${t.kind} <> 'geracao' or (${t.topic} is not null and ${t.authorId} is not null and ${t.editorialContextVersion} is not null and ${t.baseVersion} is null and ${t.reviewId} is null)`,
    ),
    check(
      'generation_runs_correcao_check',
      sql`${t.kind} <> 'correcao' or (${t.contentId} is not null and ${t.baseVersion} is not null and ${t.reviewId} is not null and ${t.topic} is null and ${t.authorId} is null)`,
    ),
  ],
);
