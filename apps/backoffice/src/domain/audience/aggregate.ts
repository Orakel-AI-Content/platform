// SQL da audiência diária no dialeto do Analytics Engine (#546): a agregação roda no AE, e o
// Node só recebe uma linha por site/dia (ou site/artigo/dia). Colunas sempre por `COLUMNS`
// do @orakel/events (layout v1, ADR 0007); nenhum `blobN` escrito à mão.
import { COLUMNS } from '@orakel/events/v1';

/** Fuso do dia da audiência: o mesmo do limite diário de publicações. */
export const AUDIENCE_TIME_ZONE = 'America/Sao_Paulo';

/** Janela de dias locais, inclusiva nas duas pontas, em `AAAA-MM-DD`. */
export type DayWindow = { from: string; to: string };

export type SiteDayRow = { site: string; day: string; views: number; sessions: number };
export type ArticleDayRow = SiteDayRow & { article: string };

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isDay(value: string): boolean {
  if (!DAY_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/** Recusa janela malformada ou invertida: os dias entram literais na SQL (bug, não Result). */
export function assertDayWindow(window: DayWindow): void {
  if (!isDay(window.from) || !isDay(window.to)) {
    throw new Error(`Janela de audiência inválida: ${JSON.stringify(window)}`);
  }
  if (window.from > window.to) {
    throw new Error(`Janela de audiência invertida: ${window.from} > ${window.to}`);
  }
}

const DAY = `formatDateTime(toTimeZone(timestamp, '${AUDIENCE_TIME_ZONE}'), '%Y-%m-%d')`;

function dailySql(window: DayWindow, keys: Record<string, string>, onlyArticles: boolean) {
  assertDayWindow(window);
  const names = [...Object.keys(keys), 'day'].join(', ');
  const columns = Object.entries(keys).map(([name, column]) => `${column} AS ${name}`);
  const filters = [
    `${COLUMNS.type} = 'pageview'`,
    ...(onlyArticles ? [`${COLUMNS.articleId} != ''`] : []),
    `${DAY} >= '${window.from}'`,
    `${DAY} <= '${window.to}'`,
  ];
  return [
    `SELECT ${columns.join(', ')}, ${DAY} AS day,`,
    `  SUM(_sample_interval) AS views,`,
    `  COUNT(DISTINCT if(${COLUMNS.sid} != '', ${COLUMNS.sid}, NULL)) AS sessions`,
    `FROM events`,
    `WHERE ${filters.join('\n  AND ')}`,
    `GROUP BY ${names}`,
    `ORDER BY ${names}`,
  ].join('\n');
}

/** Uma linha por site e dia local: visualizações e `sid` distintos não vazios. */
export function siteDailySql(window: DayWindow): string {
  return dailySql(window, { site: COLUMNS.site }, false);
}

/** Uma linha por site, artigo e dia local; pageview sem artigo fica de fora. */
export function articleDailySql(window: DayWindow): string {
  return dailySql(window, { site: COLUMNS.site, article: COLUMNS.articleId }, true);
}
