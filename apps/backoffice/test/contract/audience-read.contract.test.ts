import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import { audienceDailySite, sites } from '../../src/db/schema/index.ts';
import type { Actor } from '../../src/domain/access/rbac.ts';
import { readSiteAudience } from '../../src/domain/audience/read.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

// Leitura da audiência do site (#548) contra o Postgres: só os dias da janela de São Paulo,
// só do site pedido, do mais recente para o mais antigo, com os totais somados.

let db: Db;
let close: () => Promise<void>;

const revisor: Actor = { email: 'revisor@exemplo.com', roles: ['revisor'] };
/** 2026-11-04 23:30 em São Paulo (já 2026-11-05 em UTC). */
const now = new Date('2026-11-05T02:30:00Z');

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
  await db.insert(audienceDailySite).values([
    // Fora da janela de 7 dias (de 2026-10-29 a 2026-11-04), dentro da de 30.
    { siteId: 'alfa', day: '2026-10-28', views: 1000, sessions: 900 },
    { siteId: 'alfa', day: '2026-10-29', views: 10, sessions: 4 },
    { siteId: 'alfa', day: '2026-11-02', views: 20, sessions: 7 },
    { siteId: 'alfa', day: '2026-11-04', views: 30, sessions: 9 },
    // Dia de UTC de `now`: ainda não é hoje em São Paulo.
    { siteId: 'alfa', day: '2026-11-05', views: 5000, sessions: 5000 },
    { siteId: 'beta', day: '2026-11-03', views: 99, sessions: 99 },
  ]);
});

describe('leitura da audiência do site (#548)', () => {
  it('7 dias: só os dias da janela e do site, mais recente primeiro, com os totais', async () => {
    const result = await readSiteAudience(db, revisor, 'alfa', { period: 7, now });
    expect(result).toEqual({
      ok: true,
      value: {
        period: 7,
        window: { from: '2026-10-29', to: '2026-11-04' },
        totals: { views: 60, sessions: 20 },
        days: [
          { day: '2026-11-04', views: 30, sessions: 9 },
          { day: '2026-11-02', views: 20, sessions: 7 },
          { day: '2026-10-29', views: 10, sessions: 4 },
        ],
      },
    });
  });

  it('30 dias inclui os dias anteriores da janela maior', async () => {
    const result = await readSiteAudience(db, revisor, 'alfa', { period: 30, now });
    if (!result.ok) throw new Error('negado');
    expect(result.value.totals).toEqual({ views: 1060, sessions: 920 });
    expect(result.value.days.map((row) => row.day)).toEqual([
      '2026-11-04',
      '2026-11-02',
      '2026-10-29',
      '2026-10-28',
    ]);
  });

  it('sem linhas no período, totais zerados e nenhuma linha', async () => {
    const result = await readSiteAudience(db, revisor, 'beta', {
      period: 7,
      now: new Date('2026-12-31T12:00:00Z'),
    });
    expect(result.ok && result.value).toMatchObject({
      totals: { views: 0, sessions: 0 },
      days: [],
    });
  });
});
