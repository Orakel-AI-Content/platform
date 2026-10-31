import { expect, test } from '@playwright/test';

import { readFixture } from '../../src/bin/seed.ts';
import { createDb, createPool } from '../../src/db/client.ts';
import { redirects } from '../../src/db/schema/index.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
import { createSite } from '../../src/domain/sites/sites.ts';
import { getDatabaseUrl } from '../../src/env.ts';
import { asRole } from './auth.ts';
import { expectNoViolations } from './axe.ts';
import { removeSites } from './cleanup.ts';

// Alerta de redirects em 75% na página do site (#487, workspace#20 R6). Os redirects são
// gravados direto no banco (não há tela de gestão de redirects): um site no limiar (1.500
// estáticos) e um logo abaixo dele (1.499 estáticos e 74 dinâmicos). O texto e o axe do
// alerta nos dois temas também ficam no teste de componente (RedirectUsageAlert.browser).

const stamp = Date.now();
const AT_LIMIT = `e2e-redir-${stamp}-a`;
const BELOW = `e2e-redir-${stamp}-b`;
const TITLE = 'Redirecionamentos perto do limite';

function rows(siteId: string, staticCount: number, dynamicCount: number) {
  const list = [];
  for (let i = 0; i < staticCount; i++) list.push({ from: `/antigo-${i}`, to: '/' });
  for (let i = 0; i < dynamicCount; i++) list.push({ from: `/secao-${i}/*`, to: '/' });
  return list.map((r, index) => ({
    ...r,
    siteId,
    id: index + 1,
    status: 301,
    origin: 'manual' as const,
  }));
}

test.beforeAll(async () => {
  const line = (await readFixture('exemplo-b')).find((l) => l.type === 'config');
  if (line?.type !== 'config') throw new Error('fixture sem config');
  const pool = createPool(getDatabaseUrl());
  try {
    const db = createDb(pool);
    for (const [siteId, staticCount, dynamicCount] of [
      [AT_LIMIT, 1500, 0],
      [BELOW, 1499, 74],
    ] as const) {
      const result = await db.transaction((tx) =>
        createSite(tx, SYSTEM_ACTOR, {
          ...line.data,
          siteId,
          name: `Site ${siteId}`,
          domains: [`${siteId}.example.com`],
        }),
      );
      if (!result.ok) throw new Error(JSON.stringify(result.issues));
      const all = rows(siteId, staticCount, dynamicCount);
      for (let i = 0; i < all.length; i += 500) {
        await db.insert(redirects).values(all.slice(i, i + 500));
      }
    }
  } finally {
    await pool.end();
  }
});
test.afterAll(async () => {
  await removeSites([AT_LIMIT, BELOW]);
});

test('página do site: alerta de redirects no limiar, sem violação do axe', async ({ page }) => {
  await asRole(page, 'editor');

  await page.goto(`/sites/${AT_LIMIT}`);
  const alert = page.locator('.alert', { hasText: TITLE });
  await expect(alert).toBeVisible();
  await expect(alert.getByRole('listitem')).toHaveText([
    'Estáticos: 1.500 de 2.000',
    'Dinâmicos: 0 de 100',
  ]);
  await expectNoViolations(page);

  await page.goto(`/sites/${BELOW}`);
  await expect(page.getByRole('heading', { name: `Site ${BELOW}` })).toBeVisible();
  await expect(page.getByText(TITLE)).toHaveCount(0);
});
