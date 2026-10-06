import type { SiteConfig } from '@orakel/content-model/v1';
import { sql } from 'drizzle-orm';
import { check, integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

/** Ciclo de vida do site (valores escolhidos pela operação: português). */
export const SITE_LIFECYCLE = ['cadastrado', 'infra_aplicada', 'zona_ativa', 'publicado'] as const;
/** Estado operacional; `pausado` sempre tem motivo. */
export const SITE_STATES = ['ativo', 'promovendo', 'pausado'] as const;

export const sites = pgTable(
  'sites',
  {
    /** SITE_ID. */
    id: text().primaryKey(),
    name: text().notNull(),
    lifecycle: text({ enum: SITE_LIFECYCLE }).notNull().default('cadastrado'),
    state: text({ enum: SITE_STATES }).notNull().default('ativo'),
    pausedReason: text(),
    /** Release do core registrada para o site (core-vX.Y.Z); nula até a primeira promoção. */
    release: text(),
    /**
     * Janela de agrupamento dos builds do site, em segundos; nula usa BUILD_WINDOW_SECONDS.
     * Operacional: fora da SiteConfig e do snapshot.
     */
    buildWindowSeconds: integer(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('sites_build_window_seconds_check', sql`${t.buildWindowSeconds} >= 0`)],
);

/** Configuração versionada: a corrente é a de maior versão. */
export const siteConfigs = pgTable(
  'site_configs',
  {
    siteId: text()
      .notNull()
      .references(() => sites.id),
    version: integer().notNull(),
    config: jsonb().$type<SiteConfig>().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.version] })],
);

/**
 * IDs numéricos por site (conteúdo, autor, mídia…). Estáveis e nunca reutilizados: entram
 * no identificador de reconciliação de afiliados (s{site}a{artigo}b{bloco}).
 */
export const siteSequences = pgTable(
  'site_sequences',
  {
    siteId: text()
      .notNull()
      .references(() => sites.id),
    entity: text().notNull(),
    last: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.entity] })],
);
