import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { readFixture } from '../../src/bin/seed.ts';
import { createDb, createPool } from '../../src/db/client.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
import { recordBuild } from '../../src/domain/builds/builds.ts';
import { createSite } from '../../src/domain/sites/sites.ts';
import { getEnv } from '../../src/env.ts';
import { removeSites } from './cleanup.ts';

// Lista de sites legível de relance (#100): com 20 sites numa janela de 1280 px, ao lado da
// barra lateral do Ecme (290 px, #237), nem a página nem a tabela rolam na horizontal e nenhuma
// célula passa de duas linhas de texto (Table do Ecme, #248). Os 18 sites além dos
// do seed são gravados pelo domínio (cadastrar 18 pela tela só tornaria o teste lento) e
// removidos no fim. O pior caso de largura fica na própria rodada, sem depender do banco
// (#153): um site pausado por falha permanente, com motivo longo, e um com último build
// publicado e versão longa.

const stamp = Date.now();
const created = Array.from({ length: 18 }, (_, index) => `e2e-lista-${stamp}-${index + 1}`);
/** Nome e domínio longos: o corte com `title` tem de segurar a largura e a altura. */
const LONG_NAME = 'Guia completo de receitas regionais brasileiras para o dia a dia';

/** Motivo da pausa longo, no formato `<etapa>: <mensagem>` de uma falha permanente. */
const LONG_FAILURE = 'Tema "padrao-editorial-receitas" não existe nesta release do site-builder';
const LONG_VERSION = '3f9c2a7e-5b1d-4c8e-9a6f-0d2e4b7c1a95';

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
    const run = (siteId: string) => ({
      siteId,
      release: 'e2e',
      jobId: undefined,
      attempt: 1,
      startedAt: new Date(),
    });
    await db.transaction(async (tx) => {
      // Falha permanente: grava o build falho e pausa o site com `render: <mensagem>`.
      await recordBuild(tx, run(created[1]!), {
        status: 'failed',
        stage: 'render',
        failure: { kind: 'permanent', message: LONG_FAILURE },
      });
      await recordBuild(tx, run(created[2]!), {
        status: 'ok',
        render: {
          formatVersion: 1,
          status: 'ok',
          site: created[2]!,
          release: 'e2e',
          durationMs: 1,
          pendingChangeIds: [],
          pages: 1,
          files: 1,
          redirectUsage: {
            static: 0,
            dynamic: 0,
            limits: { static: 0, dynamic: 0 },
            alert: false,
          },
        },
        publish: {
          formatVersion: 1,
          status: 'ok',
          site: created[2]!,
          target: 'local',
          versionId: LONG_VERSION,
          cacheKey: 'e2e',
          durationMs: 1,
        },
        renderMs: 1,
        publishMs: 1,
      });
    });
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

test('com 20 sites em 1280 px, página e tabela sem rolagem horizontal e linhas de até duas linhas', async ({
  page,
}) => {
  await loginAsAdmin(page);
  const table = page.getByRole('table');
  const rows = table.locator('tbody tr');
  expect(await rows.count()).toBeGreaterThanOrEqual(20);

  // Nem a página nem o contêiner da tabela (`overflow-x-auto` da Table) rolam na horizontal.
  const viewport = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth);
  const container = await table.evaluate((element) => ({
    scrollWidth: element.parentElement!.scrollWidth,
    clientWidth: element.parentElement!.clientWidth,
  }));
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

  // O pior caso está na lista, cortado, com o texto inteiro em `title` (#153).
  const paused = rows.filter({ hasText: `${created[1]} · ` });
  await expect(paused.getByText('Pausado', { exact: true })).toBeVisible();
  await expect(paused.getByTitle(`render: ${LONG_FAILURE}`)).toBeVisible();
  const built = rows.filter({ hasText: `${created[2]} · ` });
  await expect(built.getByTitle(new RegExp(` · ${LONG_VERSION}$`))).toBeVisible();

  // O cadastro registrou a configuração v1: a pendência se destaca e leva à tela dela.
  const pending = row.getByRole('link', { name: `1 mudança pendente em ${created[0]}` });
  await expect(pending).toHaveAttribute('href', `/sites/${created[0]}/pendencias`);

  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

// Cabeçalho (título e ações) no visual do Ecme (#247), nos dois temas.
for (const colorScheme of ['light', 'dark'] as const) {
  test(`a lista de sites sem violação do axe (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await loginAsAdmin(page);
    await expect(page.getByRole('link', { name: 'Cadastrar site' })).toBeVisible();

    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();
    expect(accessibility.violations).toEqual([]);
  });
}

// "Mais ações" no Dropdown do Ecme (#248): `menu` com `menuitem`, aberto pelo mouse ou pelo
// teclado; ao abrir, o foco vai ao primeiro item e as setas o levam aos outros.
test('o menu Mais ações abre e fecha pelo mouse e pelo teclado; Esc devolve o foco', async ({
  page,
}) => {
  await loginAsAdmin(page);
  const button = page.getByRole('button', { name: 'Mais ações: exemplo-a' });
  const menu = page.getByRole('menu');
  const first = menu.getByRole('menuitem', { name: 'Conteúdos exemplo-a' });
  const item = menu.getByRole('menuitem', { name: 'Editar configuração exemplo-a' });

  // Mouse: abre no clique e fecha no clique fora.
  await button.click();
  await expect(item).toBeVisible();
  await page.getByRole('heading', { name: 'Sites' }).click();
  await expect(menu).toHaveCount(0);

  // Teclado: Enter abre com o foco no primeiro item; as setas percorrem; Esc fecha e devolve o
  // foco ao botão.
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(first).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: 'Mídia exemplo-a' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(item).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(button).toBeFocused();

  // Espaço e seta para baixo no botão também abrem.
  for (const key of ['Space', 'ArrowDown']) {
    await page.keyboard.press(key);
    await expect(first).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(button).toBeFocused();
  }
});

test('acionar um item do menu Mais ações fecha a lista e navega, pelo teclado e pelo mouse', async ({
  page,
}) => {
  await loginAsAdmin(page);
  const button = page.getByRole('button', { name: 'Mais ações: exemplo-a' });
  const menu = page.getByRole('menu');

  // Teclado: Enter no item focado.
  await button.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: 'Mídia exemplo-a' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/sites\/exemplo-a\/midia$/);
  await expect(menu).toHaveCount(0);

  // Mouse.
  await page.goBack();
  await page.waitForLoadState('networkidle');
  await button.click();
  await menu.getByRole('menuitem', { name: 'Conteúdos exemplo-a' }).click();
  await expect(page).toHaveURL(/\/sites\/exemplo-a\/conteudos$/);
  await expect(menu).toHaveCount(0);
});

test('com 20 sites, a lista do seletor de site cabe na janela, rola e alcança o último site', async ({
  page,
}) => {
  // Seletor de site (#221, #241): sem altura máxima, a lista passava da borda inferior e os
  // últimos sites ficavam fora de alcance, sem rolagem. O menu do Dropdown rola por dentro
  // (o <ul>), e as setas levam o foco até o último.
  await page.setViewportSize({ width: 1280, height: 720 });
  await loginAsAdmin(page);
  await page.goto('/sites/exemplo-a');
  await page.waitForLoadState('networkidle');
  const button = page.getByRole('button', { name: 'Exemplo A — Guias, trocar de site' });
  const menu = page.getByRole('menu');

  await button.focus();
  await page.keyboard.press('Enter');
  await expect(menu).toBeVisible();
  const box = await button.evaluate((anchor) => {
    const list = document.querySelector('[role="menu"] ul')!;
    const rect = list.getBoundingClientRect();
    return {
      items: list.querySelectorAll('[role="menuitem"]').length,
      height: rect.height,
      bottom: rect.bottom,
      below: window.innerHeight - anchor.getBoundingClientRect().bottom,
      scrollHeight: list.scrollHeight,
      clientHeight: list.clientHeight,
    };
  });
  expect(box.items).toBeGreaterThanOrEqual(20);
  expect(box.bottom).toBeLessThanOrEqual(720);
  expect(box.height).toBeLessThanOrEqual(box.below);
  expect(box.scrollHeight).toBeGreaterThan(box.clientHeight);

  // O último site: as setas chegam a ele (e o rolam para a vista), e o Enter leva à mesma
  // área do outro site.
  const last = menu.getByRole('menuitem').last();
  await expect(menu.getByRole('menuitem').first()).toBeFocused();
  for (let step = 1; step < box.items; step += 1) await page.keyboard.press('ArrowDown');
  await expect(last).toBeFocused();
  await expect(last).toBeInViewport();
  const href = await last.getAttribute('href');
  expect(href).toMatch(/^\/sites\/[\w-]+$/);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`${href}$`));
});
