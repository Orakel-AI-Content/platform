import { asc } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import { audienceDailyArticle, audienceDailySite, sites } from '../../src/db/schema/index.ts';
import type { ArticleDayRow, SiteDayRow } from '../../src/domain/audience/aggregate.ts';
import { consolidateAudience } from '../../src/domain/audience/consolidate.ts';
import { AeSqlError, memoryAeSqlClient, type AeSqlClient } from '../../src/domain/audience/sql.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

// Consolidação da audiência diária (#546) contra o Postgres; o AE é o cliente em memória,
// que responde o que a janela pediu (a SQL de verdade roda no teste de integração com o
// ClickHouse, aggregate.integration.test.ts).

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await setupDatabase());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDatabase(db);
  await db.insert(sites).values([
    { id: 'alfa', name: 'Alfa' },
    { id: 'beta', name: 'Beta' },
  ]);
});

/** AE em memória: devolve as linhas dos dias que a SQL pede. */
function fakeAe(
  siteRows: SiteDayRow[],
  articleRows: ArticleDayRow[],
): AeSqlClient & { queries: string[] } {
  return memoryAeSqlClient((sql) => {
    const [, from, to] = /'(\d{4}-\d{2}-\d{2})'[\s\S]*'(\d{4}-\d{2}-\d{2})'/.exec(sql) ?? [];
    const inWindow = (row: { day: string }) => from! <= row.day && row.day <= to!;
    return sql.includes('AS article') ? articleRows.filter(inWindow) : siteRows.filter(inWindow);
  });
}

const siteTable = () =>
  db
    .select()
    .from(audienceDailySite)
    .orderBy(asc(audienceDailySite.siteId), asc(audienceDailySite.day));
const articleTable = () =>
  db
    .select()
    .from(audienceDailyArticle)
    .orderBy(
      asc(audienceDailyArticle.siteId),
      asc(audienceDailyArticle.articleId),
      asc(audienceDailyArticle.day),
    );

const window = { from: '2026-11-02', to: '2026-11-03' };

describe('consolidação da audiência diária (#546)', () => {
  it('grava por site/dia e por site/artigo/dia o que o AE agregou', async () => {
    const ae = fakeAe(
      [
        { site: 'alfa', day: '2026-11-02', views: 12, sessions: 5 },
        { site: 'beta', day: '2026-11-03', views: 3, sessions: 0 },
      ],
      [{ site: 'alfa', article: '7', day: '2026-11-02', views: 9, sessions: 4 }],
    );

    const result = await consolidateAudience(db, ae, window);

    expect(result).toEqual({ window, siteRows: 2, articleRows: 1, unknownSites: [] });
    expect(ae.queries).toHaveLength(2);
    expect(await siteTable()).toEqual([
      { siteId: 'alfa', day: '2026-11-02', views: 12, sessions: 5 },
      { siteId: 'beta', day: '2026-11-03', views: 3, sessions: 0 },
    ]);
    expect(await articleTable()).toEqual([
      { siteId: 'alfa', articleId: 7, day: '2026-11-02', views: 9, sessions: 4 },
    ]);
  });

  it('rodar duas vezes a mesma janela dá os mesmos números (regrava, não soma)', async () => {
    const ae = fakeAe(
      [{ site: 'alfa', day: '2026-11-02', views: 12, sessions: 5 }],
      [{ site: 'alfa', article: '7', day: '2026-11-02', views: 9, sessions: 4 }],
    );

    await consolidateAudience(db, ae, window);
    const first = { sites: await siteTable(), articles: await articleTable() };
    await consolidateAudience(db, ae, window);

    expect({ sites: await siteTable(), articles: await articleTable() }).toEqual(first);
  });

  it('dias fora da janela ficam intactos; dia da janela sem eventos perde as linhas', async () => {
    await consolidateAudience(
      db,
      fakeAe(
        [
          { site: 'alfa', day: '2026-11-01', views: 1, sessions: 1 },
          { site: 'alfa', day: '2026-11-02', views: 2, sessions: 1 },
          { site: 'alfa', day: '2026-11-04', views: 4, sessions: 1 },
        ],
        [
          { site: 'alfa', article: '7', day: '2026-11-01', views: 1, sessions: 1 },
          { site: 'alfa', article: '7', day: '2026-11-02', views: 2, sessions: 1 },
        ],
      ),
      { from: '2026-11-01', to: '2026-11-04' },
    );

    // Na nova leitura, o AE não tem mais nada nos dias 02 e 03.
    await consolidateAudience(db, fakeAe([], []), window);

    expect(await siteTable()).toEqual([
      { siteId: 'alfa', day: '2026-11-01', views: 1, sessions: 1 },
      { siteId: 'alfa', day: '2026-11-04', views: 4, sessions: 1 },
    ]);
    expect(await articleTable()).toEqual([
      { siteId: 'alfa', articleId: 7, day: '2026-11-01', views: 1, sessions: 1 },
    ]);
  });

  it('site fora de `sites` não é gravado e volta em unknownSites', async () => {
    const result = await consolidateAudience(
      db,
      fakeAe(
        [
          { site: 'alfa', day: '2026-11-02', views: 2, sessions: 1 },
          { site: 'fantasma', day: '2026-11-02', views: 5, sessions: 2 },
        ],
        [{ site: 'fantasma', article: '1', day: '2026-11-02', views: 5, sessions: 2 }],
      ),
      window,
    );

    expect(result.unknownSites).toEqual(['fantasma']);
    expect((await siteTable()).map((row) => row.siteId)).toEqual(['alfa']);
    expect(await articleTable()).toEqual([]);
  });

  it('falha do AE não mexe nas tabelas', async () => {
    await consolidateAudience(
      db,
      fakeAe([{ site: 'alfa', day: '2026-11-02', views: 2, sessions: 1 }], []),
      window,
    );
    const failing: AeSqlClient = {
      query: () => Promise.reject(new AeSqlError('ClickHouse indisponível')),
    };

    await expect(consolidateAudience(db, failing, window)).rejects.toBeInstanceOf(AeSqlError);
    expect(await siteTable()).toHaveLength(1);
  });

  it('nenhuma coluna das tabelas diárias guarda IP nem dado do visitante', async () => {
    const { rows } = await db.$client.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name from information_schema.columns
       where table_name in ('audience_daily_site', 'audience_daily_article')
       order by table_name, ordinal_position`,
    );
    expect(rows.map((row) => `${row.table_name}.${row.column_name}`)).toEqual([
      'audience_daily_article.site_id',
      'audience_daily_article.article_id',
      'audience_daily_article.day',
      'audience_daily_article.views',
      'audience_daily_article.sessions',
      'audience_daily_site.site_id',
      'audience_daily_site.day',
      'audience_daily_site.views',
      'audience_daily_site.sessions',
    ]);
  });
});
