import { COLUMNS } from '@orakel/events/v1';
import { describe, expect, it } from 'vitest';

import { articleDailySql, assertDayWindow, siteDailySql } from './aggregate.ts';

const window = { from: '2026-11-01', to: '2026-11-03' };

describe('SQL da audiência diária', () => {
  it('conta só pageviews, no dia de America/Sao_Paulo, dentro da janela', () => {
    const sql = siteDailySql(window);
    expect(sql).toContain(`${COLUMNS.type} = 'pageview'`);
    expect(sql).toContain("toTimeZone(timestamp, 'America/Sao_Paulo')");
    expect(sql).toContain(">= '2026-11-01'");
    expect(sql).toContain("<= '2026-11-03'");
    expect(sql).toContain('SUM(_sample_interval) AS views');
    expect(sql).toContain(`COUNT(DISTINCT if(${COLUMNS.sid} != '', ${COLUMNS.sid}, NULL))`);
    expect(sql).toMatch(/GROUP BY site, day$/m);
  });

  it('por artigo agrupa também pelo artigo e deixa de fora pageview sem artigo', () => {
    const sql = articleDailySql(window);
    expect(sql).toContain(`${COLUMNS.articleId} AS article`);
    expect(sql).toContain(`${COLUMNS.articleId} != ''`);
    expect(sql).toMatch(/GROUP BY site, article, day$/m);
  });

  it('só usa os blobs que COLUMNS atribui a type, articleId e sid', () => {
    const allowed = new Set([COLUMNS.type, COLUMNS.articleId, COLUMNS.sid]);
    for (const sql of [siteDailySql(window), articleDailySql(window)]) {
      const blobs = sql.match(/blob\d+/g) ?? [];
      expect(blobs.length).toBeGreaterThan(0);
      for (const blob of blobs) expect(allowed).toContain(blob);
    }
  });

  it.each([
    [{ from: '2026-11-1', to: '2026-11-03' }],
    [{ from: '2026-02-30', to: '2026-03-01' }],
    [{ from: "2026-11-01' OR 1=1 --", to: '2026-11-03' }],
    [{ from: '2026-11-04', to: '2026-11-03' }],
  ])('recusa janela inválida %j', (bad) => {
    expect(() => assertDayWindow(bad)).toThrow(/Janela de audiência/);
    expect(() => siteDailySql(bad)).toThrow(/Janela de audiência/);
  });

  it('aceita janela de um dia só', () => {
    expect(() => assertDayWindow({ from: '2026-11-03', to: '2026-11-03' })).not.toThrow();
  });
});
