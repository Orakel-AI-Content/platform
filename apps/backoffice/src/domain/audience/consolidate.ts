// Consolidação da audiência diária (#546): lê do Analytics Engine as contagens já agregadas
// por dia local e regrava, numa transação, todos os dias da janela nas tabelas diárias.
// Regravar (apaga + insere) em vez de somar: repetir a mesma janela dá os mesmos números, e
// eventos atrasados ou linhas que somem do AE se resolvem na próxima rodada.
import { and, gte, lte } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { audienceDailyArticle, audienceDailySite, sites } from '../../db/schema/index.ts';
import {
  articleDailySql,
  assertDayWindow,
  siteDailySql,
  type ArticleDayRow,
  type DayWindow,
  type SiteDayRow,
} from './aggregate.ts';
import type { AeSqlClient } from './sql.ts';

/** Linhas por insert: 5 colunas × 1000 fica longe do limite de parâmetros do Postgres. */
const INSERT_CHUNK = 1000;

export type SiteDay = typeof audienceDailySite.$inferInsert;
export type ArticleDay = typeof audienceDailyArticle.$inferInsert;

export type ConsolidationResult = {
  window: DayWindow;
  siteRows: number;
  articleRows: number;
  /**
   * Sites que aparecem no AE e não estão em `sites`: as linhas deles ficam de fora (a FK as
   * recusaria). Quem chama registra o aviso.
   */
  unknownSites: string[];
};

function count(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Contagem inválida vinda do Analytics Engine: ${String(value)}`);
  }
  return parsed;
}

/** ID de artigo como o Worker grava (inteiro positivo em texto); outro valor é descartado. */
function articleId(value: string): number | undefined {
  if (!/^[1-9]\d*$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

/** Converte as linhas do AE para as tabelas diárias, só dos sites cadastrados. */
export function toDailyRows(
  siteRows: SiteDayRow[],
  articleRows: ArticleDayRow[],
  knownSites: ReadonlySet<string>,
): { sites: SiteDay[]; articles: ArticleDay[]; unknownSites: string[] } {
  const unknown = new Set<string>();
  const known = (site: string) => {
    if (knownSites.has(site)) return true;
    unknown.add(site);
    return false;
  };
  const siteDays = siteRows
    .filter((row) => known(row.site))
    .map((row) => ({
      siteId: row.site,
      day: row.day,
      views: count(row.views),
      sessions: count(row.sessions),
    }));
  const articleDays: ArticleDay[] = [];
  for (const row of articleRows) {
    const id = articleId(row.article);
    if (id === undefined || !known(row.site)) continue;
    articleDays.push({
      siteId: row.site,
      articleId: id,
      day: row.day,
      views: count(row.views),
      sessions: count(row.sessions),
    });
  }
  return { sites: siteDays, articles: articleDays, unknownSites: [...unknown].sort() };
}

function chunks<T>(rows: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) out.push(rows.slice(i, i + INSERT_CHUNK));
  return out;
}

/**
 * Recalcula a audiência dos dias da janela (dias de America/Sao_Paulo, inclusivos) para todos
 * os sites. Processo do sistema (worker e bin): sem ator. Falha do AE lança `AeSqlError`
 * antes de qualquer gravação; as tabelas só mudam se a transação inteira passar.
 */
export async function consolidateAudience(
  db: Executor,
  ae: AeSqlClient,
  window: DayWindow,
): Promise<ConsolidationResult> {
  assertDayWindow(window);
  const [siteRows, articleRows] = await Promise.all([
    ae.query<SiteDayRow>(siteDailySql(window)),
    ae.query<ArticleDayRow>(articleDailySql(window)),
  ]);

  return db.transaction(async (tx) => {
    const registered = await tx.select({ id: sites.id }).from(sites);
    const rows = toDailyRows(siteRows, articleRows, new Set(registered.map((site) => site.id)));

    await tx
      .delete(audienceDailySite)
      .where(and(gte(audienceDailySite.day, window.from), lte(audienceDailySite.day, window.to)));
    await tx
      .delete(audienceDailyArticle)
      .where(
        and(gte(audienceDailyArticle.day, window.from), lte(audienceDailyArticle.day, window.to)),
      );
    for (const chunk of chunks(rows.sites)) await tx.insert(audienceDailySite).values(chunk);
    for (const chunk of chunks(rows.articles)) await tx.insert(audienceDailyArticle).values(chunk);

    return {
      window,
      siteRows: rows.sites.length,
      articleRows: rows.articles.length,
      unknownSites: rows.unknownSites,
    };
  });
}
