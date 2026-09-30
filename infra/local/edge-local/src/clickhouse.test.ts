// Spike AE × ClickHouse da L0 (ADR 0014 da raiz): as consultas típicas do agregador, no
// dialeto do Analytics Engine, rodando sem tradução na tabela events do ClickHouse local.
// Roda com EDGE_LOCAL_TEST_CLICKHOUSE_URL (CI: serviço clickhouse; local: o do compose),
// num banco descartável.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { COLUMNS, discardDataPoint, pageviewDataPoint } from '@orakel/events/v1';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { clickhouse, clickhouseSink, type ClickHouseConfig } from './ae-sink.ts';

const url = process.env.EDGE_LOCAL_TEST_CLICKHOUSE_URL;
const config: ClickHouseConfig = {
  url: url ?? 'http://localhost:8123',
  user: process.env.EDGE_LOCAL_TEST_CLICKHOUSE_USER ?? 'default',
  password: process.env.EDGE_LOCAL_TEST_CLICKHOUSE_PASSWORD ?? '',
  database: `analytics_spike_${process.pid}_${Date.now()}`,
};
const INIT_SQL = fileURLToPath(new URL('../../clickhouse/init.sql', import.meta.url));

type Json<T> = { data: T[]; rows: number };
const query = async <T>(sql: string) =>
  JSON.parse(await clickhouse(config, `${sql} FORMAT JSON`)) as Json<T>;

/** 02:30 UTC = 23:30 do dia anterior em São Paulo: a conversão de fuso muda o dia. */
const now = Date.now();
const day = (offsetDays: number, hourUtc: number) => {
  const date = new Date(now - offsetDays * 86_400_000);
  date.setUTCHours(hourUtc, 30, 0, 0);
  return date;
};

describe.skipIf(!url)('Analytics Engine × ClickHouse (spike da L0)', () => {
  beforeAll(async () => {
    const statements = (await readFile(INIT_SQL, 'utf8'))
      .replace(/--.*$/gm, '')
      .replaceAll('analytics', config.database)
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean);
    for (const statement of statements)
      await clickhouse({ ...config, database: 'default' }, statement);

    const sink = clickhouseSink(config);
    const view = (site: string, articleId: number, country: string, sid: string) =>
      pageviewDataPoint({
        site,
        path: `/artigo-${articleId}/`,
        articleId,
        country,
        device: 'desktop',
        sid,
      });
    // exemplo-a: 3 views do artigo 1 (duas sessões), 1 do artigo 2; 1 descarte; exemplo-b: 1 view.
    await sink(view('exemplo-a', 1, 'BR', 's1'), day(1, 2));
    await sink(view('exemplo-a', 1, 'BR', 's1'), day(1, 12));
    await sink(view('exemplo-a', 1, 'DE', ''), day(1, 12));
    await sink(view('exemplo-a', 2, 'US', 's2'), day(2, 12));
    await sink(discardDataPoint({ site: 'exemplo-a', reason: 'bot' }), day(1, 12));
    await sink(view('exemplo-b', 9, 'BR', 's3'), day(1, 12));
  });

  afterAll(async () => {
    await clickhouse(
      { ...config, database: 'default' },
      `DROP DATABASE IF EXISTS ${config.database}`,
    );
  });

  it('pageviews por site e dia, com SUM(_sample_interval) e o dia de São Paulo', async () => {
    const result = await query<{ site: string; day: string; pageviews: number }>(`
      SELECT ${COLUMNS.site} AS site,
             toStartOfInterval(toTimeZone(timestamp, 'America/Sao_Paulo'), INTERVAL '1' DAY) AS day,
             SUM(_sample_interval) AS pageviews
      FROM events
      WHERE ${COLUMNS.type} = 'pageview' AND timestamp >= NOW() - INTERVAL '7' DAY
      GROUP BY site, day
      ORDER BY site, day`);
    const spDay = (date: Date) =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(date);
    const expected = new Map<string, number>();
    for (const [site, date] of [
      ['exemplo-a', day(1, 2)],
      ['exemplo-a', day(1, 12)],
      ['exemplo-a', day(1, 12)],
      ['exemplo-a', day(2, 12)],
      ['exemplo-b', day(1, 12)],
    ] as const) {
      const key = `${site} ${spDay(date)}`;
      expected.set(key, (expected.get(key) ?? 0) + 1);
    }
    expect(
      Object.fromEntries(
        result.data.map((row) => [`${row.site} ${row.day.slice(0, 10)}`, row.pageviews]),
      ),
    ).toEqual(Object.fromEntries(expected));
  });

  it('top de artigos de um site', async () => {
    const result = await query<{ article: string; views: number }>(`
      SELECT ${COLUMNS.articleId} AS article, SUM(_sample_interval) AS views
      FROM events
      WHERE ${COLUMNS.site} = 'exemplo-a' AND ${COLUMNS.type} = 'pageview'
      GROUP BY article
      ORDER BY views DESC
      LIMIT 10`);
    expect(result.data).toEqual([
      { article: '1', views: 3 },
      { article: '2', views: 1 },
    ]);
  });

  it('sessões distintas e descartes por motivo', async () => {
    const sessions = await query<{ site: string; sessions: number }>(`
      SELECT ${COLUMNS.site} AS site, COUNT(DISTINCT ${COLUMNS.sid}) AS sessions
      FROM events
      WHERE ${COLUMNS.sid} != ''
      GROUP BY site
      ORDER BY site`);
    expect(sessions.data).toEqual([
      { site: 'exemplo-a', sessions: 2 },
      { site: 'exemplo-b', sessions: 1 },
    ]);
    const discards = await query<{ reason: string; total: number }>(`
      SELECT ${COLUMNS.discardReason} AS reason, SUM(_sample_interval) AS total
      FROM events
      WHERE ${COLUMNS.type} = 'discard'
      GROUP BY reason`);
    expect(discards.data).toEqual([{ reason: 'bot', total: 1 }]);
  });
});
