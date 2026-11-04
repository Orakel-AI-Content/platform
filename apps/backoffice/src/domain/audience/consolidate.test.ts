import { describe, expect, it } from 'vitest';

import { toDailyRows } from './consolidate.ts';

const known = new Set(['alfa', 'beta']);

describe('toDailyRows', () => {
  it('converte as linhas do AE para as tabelas diárias', () => {
    const rows = toDailyRows(
      [{ site: 'alfa', day: '2026-11-02', views: 10, sessions: 4 }],
      [{ site: 'alfa', article: '7', day: '2026-11-02', views: 6, sessions: 3 }],
      known,
    );
    expect(rows).toEqual({
      sites: [{ siteId: 'alfa', day: '2026-11-02', views: 10, sessions: 4 }],
      articles: [{ siteId: 'alfa', articleId: 7, day: '2026-11-02', views: 6, sessions: 3 }],
      unknownSites: [],
    });
  });

  it('deixa de fora e aponta os sites que não estão cadastrados', () => {
    const rows = toDailyRows(
      [
        { site: 'zeta', day: '2026-11-02', views: 1, sessions: 1 },
        { site: 'beta', day: '2026-11-02', views: 2, sessions: 0 },
      ],
      [{ site: 'gama', article: '3', day: '2026-11-02', views: 1, sessions: 1 }],
      known,
    );
    expect(rows.sites.map((row) => row.siteId)).toEqual(['beta']);
    expect(rows.articles).toEqual([]);
    expect(rows.unknownSites).toEqual(['gama', 'zeta']);
  });

  it.each(['abc', '0', '-1', '1.5', '007', '99999999999999999999'])(
    'descarta artigo com ID fora do formato do Worker (%s)',
    (article) => {
      const rows = toDailyRows(
        [],
        [{ site: 'alfa', article, day: '2026-11-02', views: 1, sessions: 1 }],
        known,
      );
      expect(rows.articles).toEqual([]);
    },
  );

  it('contagem negativa ou fracionária vinda do AE é bug e lança', () => {
    expect(() =>
      toDailyRows([{ site: 'alfa', day: '2026-11-02', views: -1, sessions: 0 }], [], known),
    ).toThrow(/Contagem inválida/);
    expect(() =>
      toDailyRows([{ site: 'alfa', day: '2026-11-02', views: 1, sessions: 0.5 }], [], known),
    ).toThrow(/Contagem inválida/);
  });
});
