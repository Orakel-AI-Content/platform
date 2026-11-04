// SQL da audiência diária contra um ClickHouse de verdade (#546; ADR 0014 da raiz): a tabela
// events do init.sql do ambiente local, num banco descartável, com pontos gravados pelo
// layout v1 do @orakel/events. Roda com BACKOFFICE_TEST_AE_SQL_URL (CI: serviço clickhouse do
// job quality; local: o do compose). Sem ela, é pulado.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { discardDataPoint, pageviewDataPoint, type DataPoint } from '@orakel/events/v1';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { clickhouseSqlClient } from '../../lib/clickhouse.ts';
import { articleDailySql, siteDailySql, type ArticleDayRow, type SiteDayRow } from './aggregate.ts';

const url = process.env.BACKOFFICE_TEST_AE_SQL_URL;
const database = `audience_it_${process.pid}_${Date.now()}`;
const INIT_SQL = fileURLToPath(
  new URL('../../../../../infra/local/clickhouse/init.sql', import.meta.url),
);

function withDatabase(name: string): string {
  const target = new URL(url ?? 'http://localhost:8123');
  target.searchParams.set('database', name);
  return target.toString();
}

// O corpo do describe roda na coleta mesmo pulado: o cliente só nasce dentro dos testes.
const ae = () => clickhouseSqlClient({ url: withDatabase(database) });

/** DDL e INSERT do preparo: o cliente só lê linhas (responde JSON), então aqui é POST cru. */
async function exec(sql: string, target = database): Promise<void> {
  const endpoint = new URL(withDatabase(target));
  const headers = {
    'X-ClickHouse-User': decodeURIComponent(endpoint.username),
    'X-ClickHouse-Key': decodeURIComponent(endpoint.password),
  };
  endpoint.username = '';
  endpoint.password = '';
  const response = await fetch(endpoint, { method: 'POST', headers, body: sql });
  if (!response.ok) throw new Error(`ClickHouse ${response.status}: ${await response.text()}`);
}

const quote = (value: string) => `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;

function insert(point: DataPoint, timestamp: string, sampleInterval = 1): string {
  const blobs = point.blobs.map((_, i) => `blob${i + 1}`);
  const columns = ['timestamp', 'index1', ...blobs, 'double1', '_sample_interval'];
  const values = [
    `toDateTime64(${quote(timestamp)}, 3, 'UTC')`,
    quote(point.indexes[0]),
    ...point.blobs.map(quote),
    String(point.doubles[0]),
    String(sampleInterval),
  ];
  return `INSERT INTO events (${columns.join(', ')}) VALUES (${values.join(', ')})`;
}

const view = (site: string, articleId: number | undefined, sid: string) =>
  pageviewDataPoint({ site, path: '/x/', articleId, device: 'desktop', sid });

describe.skipIf(!url)('SQL da audiência diária × ClickHouse', () => {
  beforeAll(async () => {
    const statements = (await readFile(INIT_SQL, 'utf8'))
      .replace(/--.*$/gm, '')
      .replaceAll('analytics', database)
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean);
    for (const statement of statements) await exec(statement, 'default');

    const points: [DataPoint, string, number?][] = [
      // 02h30 UTC do dia 03 = 23h30 do dia 02 em São Paulo.
      [view('alfa', 7, 's1'), '2026-11-03 02:30:00'],
      [view('alfa', 7, 's1'), '2026-11-02 15:00:00'],
      // Amostrado: vale 4 visualizações; sem sid (país sem consentimento) não conta sessão.
      [view('alfa', 8, ''), '2026-11-02 16:00:00', 4],
      // Sem artigo: conta para o site, não para a tabela por artigo.
      [view('alfa', undefined, 's2'), '2026-11-02 17:00:00'],
      // 03h00 UTC do dia 03 = 00h00 do dia 03: já é o dia seguinte.
      [view('alfa', 7, 's3'), '2026-11-03 03:00:00'],
      [view('beta', 1, 's9'), '2026-11-02 12:00:00'],
      [discardDataPoint({ site: 'alfa', reason: 'bot' }), '2026-11-02 12:00:00'],
      // Fora da janela.
      [view('alfa', 7, 's4'), '2026-11-04 12:00:00'],
    ];
    for (const [point, timestamp, sample] of points) {
      await exec(insert(point, timestamp, sample));
    }
  });

  afterAll(async () => {
    if (url) await exec(`DROP DATABASE IF EXISTS ${database}`, 'default');
  });

  const window = { from: '2026-11-02', to: '2026-11-03' };

  it('por site e dia local: SUM(_sample_interval), sid distintos não vazios, sem discard', async () => {
    const rows = await ae().query<SiteDayRow>(siteDailySql(window));
    expect(rows).toEqual([
      // s1 (duas vezes, uma delas 23h30 local), 4 amostradas sem sid, s2 → 7 views, 2 sessões.
      { site: 'alfa', day: '2026-11-02', views: 7, sessions: 2 },
      { site: 'alfa', day: '2026-11-03', views: 1, sessions: 1 },
      { site: 'beta', day: '2026-11-02', views: 1, sessions: 1 },
    ]);
  });

  it('por site, artigo e dia local, sem pageview sem artigo', async () => {
    const rows = await ae().query<ArticleDayRow>(articleDailySql(window));
    expect(rows).toEqual([
      { site: 'alfa', article: '7', day: '2026-11-02', views: 2, sessions: 1 },
      { site: 'alfa', article: '7', day: '2026-11-03', views: 1, sessions: 1 },
      { site: 'alfa', article: '8', day: '2026-11-02', views: 4, sessions: 0 },
      { site: 'beta', article: '1', day: '2026-11-02', views: 1, sessions: 1 },
    ]);
  });
});
