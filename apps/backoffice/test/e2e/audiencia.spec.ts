import { expect, test, type Page } from '@playwright/test';

import { readFixture } from '../../src/bin/seed.ts';
import { createDb, createPool } from '../../src/db/client.ts';
import { audienceDailySite } from '../../src/db/schema/index.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
import { audiencePeriodWindow } from '../../src/domain/audience/read.ts';
import { createSite } from '../../src/domain/sites/sites.ts';
import { getEnv } from '../../src/env.ts';
import { asRole } from './auth.ts';
import { expectNoViolations } from './axe.ts';
import { removeSites } from './cleanup.ts';

// Audiência do site (#548): as tabelas diárias semeadas direto no Postgres (a consolidação
// tem teste próprio) e a tela confere os totais com a soma semeada, nos períodos de 7 e 30
// dias, o `?periodo=` inválido, o estado vazio e o axe. Os dias saem da mesma janela de São
// Paulo da leitura, a partir de agora.

const stamp = Date.now();
const SITE = `e2e-audiencia-${stamp}`;
const EMPTY = `e2e-audiencia-vazio-${stamp}`;

/** Dia de São Paulo `back` dias antes de hoje. */
function daysAgo(back: number): string {
  const { to } = audiencePeriodWindow(7, new Date());
  const day = new Date(`${to}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - back);
  return day.toISOString().slice(0, 10);
}

/** Dentro dos últimos 7 dias (hoje, 2 e 6 dias atrás) e só nos 30 (10 e 29 dias atrás). */
const ROWS = [
  { back: 0, views: 1_200, sessions: 300 },
  { back: 2, views: 340, sessions: 120 },
  { back: 6, views: 60, sessions: 25 },
  { back: 10, views: 5_000, sessions: 1_000 },
  { back: 29, views: 7, sessions: 3 },
  // Fora dos 30 dias: não pode aparecer em nenhum período.
  { back: 30, views: 900_000, sessions: 900_000 },
];

const sum = (maxBack: number) =>
  ROWS.filter((row) => row.back <= maxBack).reduce(
    (total, row) => ({ views: total.views + row.views, sessions: total.sessions + row.sessions }),
    { views: 0, sessions: 0 },
  );
const format = (value: number) => new Intl.NumberFormat('pt-BR').format(value);

test.beforeAll(async () => {
  const line = (await readFixture('exemplo-b')).find((l) => l.type === 'config');
  if (line?.type !== 'config') throw new Error('fixture sem config');
  const pool = createPool(getEnv().DATABASE_URL);
  try {
    const db = createDb(pool);
    for (const siteId of [SITE, EMPTY]) {
      const result = await db.transaction((tx) =>
        createSite(tx, SYSTEM_ACTOR, {
          ...line.data,
          siteId,
          name: `Site ${siteId}`,
          domains: [`${siteId}.example.com`],
        }),
      );
      if (!result.ok) throw new Error(JSON.stringify(result.issues));
    }
    await db.insert(audienceDailySite).values(
      ROWS.map((row) => ({
        siteId: SITE,
        day: daysAgo(row.back),
        views: row.views,
        sessions: row.sessions,
      })),
    );
  } finally {
    await pool.end();
  }
});

test.afterAll(async () => {
  await removeSites([SITE, EMPTY]);
});

test.use({ viewport: { width: 1280, height: 800 } });

/**
 * Totais do período nos cartões: a soma de vários dias nunca é o número de uma linha só da
 * tabela, então o texto exato acha o cartão.
 */
async function expectTotals(page: Page, maxBack: number): Promise<void> {
  const totals = sum(maxBack);
  await expect(page.getByText(format(totals.views), { exact: true })).toBeVisible();
  await expect(page.getByText(format(totals.sessions), { exact: true })).toBeVisible();
  const days = ROWS.filter((row) => row.back <= maxBack).length;
  await expect(
    page.getByRole('table', { name: 'Audiência por dia' }).locator('tbody tr'),
  ).toHaveCount(days);
}

test('totais batem com a soma semeada em 7 e 30 dias, e a área fica ativa', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await asRole(page, 'revisor');
  await page.goto(`/sites/${SITE}/audiencia`);
  await expect(page.getByRole('heading', { name: 'Audiência', level: 1 })).toBeVisible();
  await expect(
    page
      .getByRole('navigation', { name: 'Áreas do site' })
      .getByRole('link', { name: 'Audiência' }),
  ).toHaveAttribute('aria-current', 'page');

  await expectTotals(page, 6);
  await expectNoViolations(page);

  // O seletor troca o período na URL e o servidor lê de novo.
  await page.waitForLoadState('networkidle');
  await page.getByRole('combobox', { name: 'Período:' }).focus();
  await page.keyboard.press('ArrowDown');
  await page.getByRole('option', { name: 'Últimos 30 dias' }).click();
  await expect(page).toHaveURL(/periodo=30/);
  await expectTotals(page, 29);

  await page.reload();
  await expectTotals(page, 29);
});

test('?periodo= inválido mostra 7 dias', async ({ page }) => {
  await asRole(page, 'revisor');
  await page.goto(`/sites/${SITE}/audiencia?periodo=90`);
  await expectTotals(page, 6);
});

test('sem dados no período, o estado vazio sem violação do axe', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await asRole(page, 'revisor');
  await page.goto(`/sites/${EMPTY}/audiencia`);
  await expect(
    page.getByText('Nenhuma visualização consolidada nos últimos 7 dias.'),
  ).toBeVisible();
  await expect(page.getByRole('table', { name: 'Audiência por dia' })).toHaveCount(0);
  await expectNoViolations(page);
});
