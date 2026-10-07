import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { readFixture } from '../../src/bin/seed.ts';
import { createDb, createPool } from '../../src/db/client.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
import { createSite } from '../../src/domain/sites/sites.ts';
import { getEnv } from '../../src/env.ts';
import { removeSites } from './cleanup.ts';

// Lista de sites legível de relance (#100): com 20 sites numa janela de 1280 px, a tabela
// não rola na horizontal e nenhuma linha passa de duas linhas de texto. Os 18 sites além dos
// do seed são gravados pelo domínio (cadastrar 18 pela tela só tornaria o teste lento) e
// removidos no fim.

const stamp = Date.now();
const created = Array.from({ length: 18 }, (_, index) => `e2e-lista-${stamp}-${index + 1}`);
/** Nome e domínio longos: o corte com `title` tem de segurar a largura e a altura. */
const LONG_NAME = 'Guia completo de receitas regionais brasileiras para o dia a dia';

/** Nome e `SITE_ID · domínio` na célula do site; as outras células têm uma linha só. */
const MAX_LINES_PER_CELL = 2;

test.beforeAll(async () => {
  const line = (await readFixture('exemplo-b')).find((l) => l.type === 'config');
  if (line?.type !== 'config') throw new Error('fixture sem config');
  const pool = createPool(getEnv().DATABASE_URL);
  try {
    const db = createDb(pool);
    for (const [index, siteId] of created.entries()) {
      const result = await db.transaction((tx) =>
        createSite(tx, SYSTEM_ACTOR, {
          ...line.data,
          siteId,
          name: index === 0 ? LONG_NAME : `Site ${siteId}`,
          domains: [
            index === 0
              ? `receitas-regionais-brasileiras.${siteId}.example.com`
              : `${siteId}.example.com`,
          ],
        }),
      );
      if (!result.ok) throw new Error(JSON.stringify(result.issues));
    }
  } finally {
    await pool.end();
  }
});

test.afterAll(async () => {
  await removeSites(created);
});

test.use({ viewport: { width: 1280, height: 800 } });

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/sites');
  await page.getByRole('link', { name: 'admin@orakel.local' }).click();
  await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();
  // O menu e "Publicar agora" só respondem depois da hidratação.
  await page.waitForLoadState('networkidle');
}

test('com 20 sites em 1280 px, sem rolagem horizontal e linhas de até duas linhas', async ({
  page,
}) => {
  await loginAsAdmin(page);
  const table = page.getByRole('table');
  const rows = table.locator('tbody tr');
  expect(await rows.count()).toBeGreaterThanOrEqual(20);

  const container = await table.evaluate((element) => {
    const box = element.parentElement!;
    return { scrollWidth: box.scrollWidth, clientWidth: box.clientWidth };
  });
  expect(container.scrollWidth).toBeLessThanOrEqual(container.clientWidth);

  // Linhas de texto por célula, não altura em px (#117): um badge ou botão 1 px maior não
  // muda a contagem. Só nós de texto visíveis (a Range da célula inteira traria as caixas dos
  // badges, alguns px acima do texto); o texto sr-only mede 1 px e fica de fora. Retângulos
  // que se sobrepõem na vertical são a mesma linha: badge e texto ao lado não têm o mesmo top.
  const cells = await rows.evaluateAll((trs) =>
    trs.flatMap((tr) =>
      Array.from(tr.querySelectorAll('td'), (cell, column) => {
        const lines: { top: number; bottom: number }[] = [];
        const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
          if (!node.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const rect of range.getClientRects()) {
            if (rect.width <= 1 || rect.height <= 1) continue;
            const middle = (rect.top + rect.bottom) / 2;
            const line = lines.find((l) => l.top <= middle && middle <= l.bottom);
            if (line === undefined) lines.push({ top: rect.top, bottom: rect.bottom });
            else
              Object.assign(line, {
                top: Math.min(line.top, rect.top),
                bottom: Math.max(line.bottom, rect.bottom),
              });
          }
        }
        const site = tr.querySelector('td')?.textContent?.trim().slice(0, 60) ?? '';
        return { site, column, lines: lines.length };
      }),
    ),
  );
  expect(cells.length).toBeGreaterThan(0);
  expect(cells.filter((cell) => cell.lines > MAX_LINES_PER_CELL)).toEqual([]);

  // Todas as informações continuam na linha; o nome longo fica cortado, inteiro no `title`.
  // `-1` também casaria com `-10`…`-18`: a linha é a do ID seguido do separador.
  const row = rows.filter({ hasText: `${created[0]} · ` });
  await expect(row.getByRole('link', { name: LONG_NAME })).toHaveAttribute('title', LONG_NAME);
  for (const text of ['Cadastrado', 'Sem release', 'Ativo', 'Não']) {
    await expect(row.getByText(text, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole('columnheader', { name: 'SITE_ID' })).toHaveCount(0);

  // O cadastro registrou a configuração v1: a pendência se destaca e leva à tela dela.
  const pending = row.getByRole('link', { name: `1 mudança pendente em ${created[0]}` });
  await expect(pending).toHaveAttribute('href', `/sites/${created[0]}/pendencias`);

  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test('o menu Mais ações abre e fecha pelo mouse e pelo teclado; Esc devolve o foco', async ({
  page,
}) => {
  await loginAsAdmin(page);
  const button = page.getByRole('button', { name: 'Mais ações: exemplo-a' });
  const item = page.getByRole('link', { name: 'Editar configuração exemplo-a' });

  // Mouse: abre no clique e fecha no clique fora.
  await button.click();
  await expect(item).toBeVisible();
  await page.getByRole('heading', { name: 'Sites' }).click();
  await expect(item).toBeHidden();

  // Teclado: Enter abre, Espaço fecha e abre de novo.
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(item).toBeVisible();
  await page.keyboard.press('Space');
  await expect(item).toBeHidden();
  await page.keyboard.press('Space');
  await expect(item).toBeVisible();

  // Esc fecha com o foco dentro da lista e o devolve ao botão.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Conteúdos exemplo-a' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(item).toBeHidden();
  await expect(button).toBeFocused();
});

test('acionar um item do menu Mais ações fecha a lista e devolve o foco; um link navega', async ({
  page,
}) => {
  await loginAsAdmin(page);
  const button = page.getByRole('button', { name: 'Mais ações: exemplo-a' });
  const list = page.locator(`[id="${await button.getAttribute('popovertarget')}"]`);

  // Nenhuma tela tem item botão ainda (#115): o teste põe um na lista. O clique sobe até o
  // contêiner, onde o React trata o evento, como num item vindo de `children`.
  await list.evaluate((element) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.textContent = 'Ação de teste';
    element.append(item);
  });
  const item = list.getByRole('button', { name: 'Ação de teste' });

  // Mouse.
  await button.click();
  await item.click();
  await expect(item).toBeHidden();
  await expect(button).toBeFocused();

  // Teclado: Enter e Espaço no item.
  for (const key of ['Enter', 'Space']) {
    await page.keyboard.press('Enter');
    await expect(item).toBeVisible();
    await item.focus();
    await page.keyboard.press(key);
    await expect(item).toBeHidden();
    await expect(button).toBeFocused();
  }

  // Um item link continua navegando.
  await button.click();
  await page.getByRole('link', { name: 'Conteúdos exemplo-a' }).click();
  await expect(page).toHaveURL(/\/sites\/exemplo-a\/conteudos$/);
});
