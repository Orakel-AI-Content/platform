import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { readFixture } from '../../src/bin/seed.ts';
import { createDb, createPool } from '../../src/db/client.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
import { recordBuild } from '../../src/domain/builds/builds.ts';
import { createSite } from '../../src/domain/sites/sites.ts';
import { getEnv } from '../../src/env.ts';
import { asRole } from './auth.ts';
import { removeSites } from './cleanup.ts';

// Lista de sites (#100, #364) contra o ambiente local: busca, filtro e menu "Mais ações". Os 18
// sites além dos do seed são gravados pelo domínio (cadastrar 18 pela tela só tornaria o teste
// lento) e removidos no fim, com um site pausado por falha permanente e um com último build
// publicado. A tabela legível de relance a 1280 px (linhas por célula, sem rolagem horizontal) e
// o seletor de site com 20 sites ficam nos testes de componente (`SitesTable.browser.test.tsx`
// e `SiteSwitcher.browser.test.tsx`, #460).

const stamp = Date.now();
const created = Array.from({ length: 18 }, (_, index) => `e2e-lista-${stamp}-${index + 1}`);
/** Nome e domínio longos: o corte com `title` tem de segurar a largura e a altura. */
const LONG_NAME = 'Guia completo de receitas regionais brasileiras para o dia a dia';

/** Motivo da pausa longo, no formato `<etapa>: <mensagem>` de uma falha permanente. */
const LONG_FAILURE = 'Tema "padrao-editorial-receitas" não existe nesta release do site-builder';
const LONG_VERSION = '3f9c2a7e-5b1d-4c8e-9a6f-0d2e4b7c1a95';

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

async function openAsAdmin(page: Page): Promise<void> {
  await asRole(page, 'admin');
  // O menu e "Publicar agora" só respondem depois da hidratação.
  await page.waitForLoadState('networkidle');
}

// Cabeçalho (título e ações) no visual do Ecme (#247); o tema escuro fica no teste de componente.
test(`a lista de sites sem violação do axe`, async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await openAsAdmin(page);
  await expect(page.getByRole('link', { name: 'Criar site' })).toBeVisible();

  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);

  // "Publicar agora" da linha confirma num diálogo (#327), sem violação com ele aberto;
  // Cancelar não publica e devolve o foco ao botão da linha.
  const publish = page.getByRole('button', { name: 'Publicar agora exemplo-a' });
  await publish.click();
  const dialog = page.getByRole('alertdialog', { name: 'Publicar exemplo-a agora?' });
  await expect(dialog).toBeVisible();
  const withDialog = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(withDialog.violations).toEqual([]);
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(publish).toBeFocused();
});

// Lista no cartão do template (#364): busca, filtro por estado, ordem e tamanho na URL;
// recarregar mantém a mesma visão.
test('busca e filtro por estado ficam na URL e recarregar mantém a mesma visão', async ({
  page,
}) => {
  await openAsAdmin(page);
  const table = page.getByRole('table', { name: 'Sites', exact: true });
  const count = page.getByRole('status').filter({ hasText: /resultados?$/ });

  await page.getByLabel('Buscar por nome, ID ou domínio').fill(`e2e-lista-${stamp}`);
  await expect(page).toHaveURL(new RegExp(`q=e2e-lista-${stamp}`));
  await expect(count).toHaveText('18 resultados');

  await page.getByRole('combobox', { name: 'Status' }).focus();
  await page.keyboard.press('ArrowDown');
  await page.getByRole('option', { name: 'Pausado' }).click();
  await expect(page).toHaveURL(/estado=pausado/);
  await expect(count).toHaveText('1 resultado');
  await expect(table.getByText(`${created[1]} · `, { exact: false })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('Buscar por nome, ID ou domínio')).toHaveValue(`e2e-lista-${stamp}`);
  await expect(count).toHaveText('1 resultado');
  await expect(table.locator('tbody tr')).toHaveCount(1);

  // Busca sem resultado: a tabela fica, com a mensagem e "0 resultados".
  await page.goto('/sites?q=nada-com-isso');
  await expect(table.getByText('Nenhum site encontrado.')).toBeVisible();
  await expect(count).toHaveText('0 resultados');
});

// "Mais ações" no Dropdown do Ecme (#248): `menu` com `menuitem`, aberto pelo mouse ou pelo
// teclado; ao abrir, o foco vai ao primeiro item e as setas o levam aos outros.
test('o menu Mais ações abre e fecha pelo mouse e pelo teclado; Esc devolve o foco', async ({
  page,
}) => {
  await openAsAdmin(page);
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
  await openAsAdmin(page);
  const button = page.getByRole('button', { name: 'Mais ações: exemplo-a' });
  const menu = page.getByRole('menu');

  // Teclado: Enter no item focado. O foco entra no menu depois que ele abre.
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(menu.getByRole('menuitem', { name: 'Conteúdos exemplo-a' })).toBeFocused();
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
