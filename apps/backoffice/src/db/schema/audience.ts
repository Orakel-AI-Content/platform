import { sql } from 'drizzle-orm';
import { check, date, index, integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';

import { sites } from './sites.ts';

// Audiência diária consolidada do Analytics Engine (#546): o dia é o de America/Sao_Paulo e
// cada consolidação regrava os dias da sua janela (nunca soma). Só contagens: sem IP, país,
// dispositivo nem referrer. Operacional: fora do snapshot.

/** Visualizações e sessões por site e dia. */
export const audienceDailySite = pgTable(
  'audience_daily_site',
  {
    siteId: text()
      .notNull()
      .references(() => sites.id),
    /** Dia local (America/Sao_Paulo), `AAAA-MM-DD`. */
    day: date({ mode: 'string' }).notNull(),
    /** `SUM(_sample_interval)` dos pageviews. */
    views: integer().notNull(),
    /** `sid` distintos não vazios dentro do dia: somar dias não dá sessões do período. */
    sessions: integer().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.siteId, t.day] }),
    // A consolidação apaga por dia, para todos os sites.
    index('audience_daily_site_day_idx').on(t.day),
    check('audience_daily_site_counts_check', sql`${t.views} >= 0 and ${t.sessions} >= 0`),
  ],
);

/**
 * Visualizações e sessões por site, artigo e dia. Sem FK para `contents`: a audiência é fato
 * observado, e um artigo excluído não pode quebrar a gravação.
 */
export const audienceDailyArticle = pgTable(
  'audience_daily_article',
  {
    siteId: text()
      .notNull()
      .references(() => sites.id),
    articleId: integer().notNull(),
    day: date({ mode: 'string' }).notNull(),
    views: integer().notNull(),
    sessions: integer().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.siteId, t.articleId, t.day] }),
    index('audience_daily_article_day_idx').on(t.day),
    check('audience_daily_article_counts_check', sql`${t.views} >= 0 and ${t.sessions} >= 0`),
  ],
);
