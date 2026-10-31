import { expect, test, type Page } from '@playwright/test';

import { asRole } from './auth.ts';

// Layout do site (#78, workspace#32) contra o ambiente local: título da aba com a área e o
// site, "não encontrado" de site e de item com o link certo e status 404, o carregamento
// entre áreas do mesmo site com o cabeçalho visível, as áreas da barra lateral (#171) pelo
// papel, os sites do seletor (#172) e a trilha. A área atual, a barra e o seletor pelo teclado,
// a troca de site, a barra recolhida entre áreas e o Drawer a 375 px ficam em
// `CollapsibleSide.browser.test.tsx` (#460, #476).

const OPERATOR = 'operacao@orakel.local';
const SITE = 'exemplo-a';
const SITE_NAME = 'Exemplo A — Guias';

const AREAS = ['Visão geral', 'Conteúdos', 'Revisão', 'Mídia', 'Autores', 'Taxonomias', 'Menus'];

test('a aba mostra a área e, dentro de um site, o nome dele', async ({ page }) => {
  await asRole(page, 'operacao');
  await expect(page).toHaveTitle('Sites · Orakel Backoffice');

  await page.goto('/sites/novo');
  await expect(page).toHaveTitle('Criar site · Orakel Backoffice');

  await page.goto(`/sites/${SITE}`);
  await expect(page).toHaveTitle(`${SITE_NAME} · Orakel Backoffice`);

  for (const [path, area] of [
    ['midia', 'Mídia'],
    ['conteudos', 'Conteúdos'],
    ['autores', 'Autores'],
    ['taxonomias', 'Taxonomias'],
    ['menus', 'Menus'],
    ['configuracao', 'Configuração do site'],
  ]) {
    await page.goto(`/sites/${SITE}/${path}`);
    await expect(page).toHaveTitle(`${area} · ${SITE_NAME} · Orakel Backoffice`);
  }
});

test('site inexistente leva a Sites; item inexistente leva ao site; os dois com 404', async ({
  page,
}) => {
  await asRole(page, 'operacao');

  const missingSite = await page.goto('/sites/inexistente/midia');
  expect(missingSite?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
  await expect(page.getByRole('banner')).toContainText(OPERATOR);
  await page.getByRole('link', { name: 'Ir para a lista de sites' }).click();
  await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();

  const missingContent = await page.goto(`/sites/${SITE}/conteudos/999999`);
  expect(missingContent?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
  await expect(page.getByRole('banner')).toContainText(OPERATOR);
  await page.getByRole('link', { name: `Ir para o site ${SITE_NAME}` }).click();
  await expect(page).toHaveURL(new RegExp(`/sites/${SITE}$`));
  await expect(page.getByRole('heading', { level: 1 })).toContainText(SITE_NAME);
});

test('entre áreas do mesmo site, o carregamento aparece com o cabeçalho visível', async ({
  page,
}) => {
  await asRole(page, 'operacao');
  await page.goto(`/sites/${SITE}`);
  await page.waitForLoadState('networkidle');

  // Segura a resposta da Mídia (não o prefetch) para o carregamento ficar visível.
  await page.route(
    (url) => url.pathname === `/sites/${SITE}/midia`,
    async (route) => {
      const headers = route.request().headers();
      if (headers['rsc'] === '1' && headers['next-router-prefetch'] === undefined) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      await route.continue();
    },
  );

  await page.getByRole('link', { name: 'Mídia', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Carregando' })).toBeVisible();
  await expect(page.getByRole('banner')).toContainText(OPERATOR);

  await expect(page).toHaveTitle(`Mídia · ${SITE_NAME} · Orakel Backoffice`);
  await expect(page.getByRole('status').filter({ hasText: 'Carregando' })).toHaveCount(0);
  await expect(page.getByRole('banner')).toContainText(OPERATOR);
});

test('a barra lateral lista as áreas, sem Textos institucionais para quem não edita', async ({
  page,
}) => {
  await asRole(page, 'operacao');
  await page.goto(`/sites/${SITE}`);
  const bar = page.getByRole('navigation', { name: 'Áreas do site' });
  await expect(bar.getByRole('link')).toHaveText(AREAS);
  // A página do site não repete as áreas; "Editar configuração" continua nela.
  await expect(page.getByRole('link', { name: 'Autores', exact: true })).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Editar configuração' })).toBeVisible();
});

test('com content.write, a barra também tem Textos institucionais', async ({ page }) => {
  await asRole(page, 'editor');
  await page.goto(`/sites/${SITE}/midia`);
  await expect(
    page.getByRole('navigation', { name: 'Áreas do site' }).getByRole('link'),
  ).toHaveText([...AREAS, 'Textos institucionais']);
});

const switcher = (page: Page) => page.getByRole('button', { name: `${SITE_NAME}, trocar de site` });

test('o seletor lista os sites de quem pede, com o atual marcado', async ({ page }) => {
  await asRole(page, 'editor');
  const menu = page.getByRole('menu');

  // Outros arquivos do E2E rodam em paralelo e cadastram e removem sites (o sites-list.spec
  // grava 18 no beforeAll), então a lista pode mudar entre a leitura da tabela e a do seletor.
  // As duas são relidas até concordarem, o que acontece assim que a outra rodada termina a
  // carga ou a limpeza.
  await expect
    .poll(
      async () => {
        await page.goto('/sites');
        const visible = await page
          .getByRole('table')
          .getByRole('row')
          .filter({ has: page.getByRole('cell') })
          .count();
        await page.goto(`/sites/${SITE}`);
        await switcher(page).click();
        await expect(menu).toBeVisible();
        const listed = await menu.getByRole('menuitem').count();
        return listed === visible;
      },
      { timeout: 30_000, intervals: [500] },
    )
    .toBe(true);
  await expect(menu.locator('[aria-current="true"]')).toHaveText(SITE_NAME);
});

test('trilha nas telas de item: Sites › Site › Área › Item, sem link de volta solto', async ({
  page,
}) => {
  await asRole(page, 'editor');
  const trail = page.getByRole('navigation', { name: 'Trilha de navegação' });
  const main = page.getByRole('main');
  const expectTrail = async (items: readonly string[]) => {
    await expect(trail.getByRole('listitem')).toHaveText(
      items.map((item, index) => (index === 0 ? item : `›${item}`)),
    );
    await expect(trail.getByRole('link')).toHaveCount(items.length - 1);
    await expect(trail.locator('[aria-current="page"]')).toHaveText(items.at(-1) ?? '');
    await expect(
      main.getByRole('link', { name: /^(Conteúdos|Autores|Taxonomias|Menus) de / }),
    ).toHaveCount(0);
    await expect(
      main.getByRole('link', { name: /Todas as versões|Versões do conteúdo/ }),
    ).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).not.toContainText(`(${SITE})`);
  };

  for (const [path, area, item] of [
    ['autores/novo', 'Autores', 'Criar autor'],
    ['taxonomias/novo', 'Taxonomias', 'Criar taxonomia'],
    ['menus/novo', 'Menus', 'Criar menu'],
    ['conteudos/novo', 'Conteúdos', 'Criar conteúdo'],
  ] as const) {
    await page.goto(`/sites/${SITE}/${path}`);
    await expectTrail(['Sites', SITE_NAME, area, item]);
  }

  // Editar um item existente: o último nível é o nome dele.
  await page.goto(`/sites/${SITE}/autores`);
  const firstAuthor = main.getByRole('table').getByRole('row').nth(1);
  const authorName = ((await firstAuthor.getByRole('cell').first().textContent()) ?? '').trim();
  await firstAuthor.getByRole('link', { name: `Editar ${authorName}` }).click();
  await expectTrail(['Sites', SITE_NAME, 'Autores', authorName]);

  // Conteúdo: versões, editar e uma versão.
  await page.goto(`/sites/${SITE}/conteudos`);
  await main
    .getByRole('table')
    .getByRole('link', { name: /\(ver versões\)/ })
    .first()
    .click();
  // Espera a tela do conteúdo (o h2 "Versões"): lido antes, o h1 ainda seria o da lista de
  // conteúdos. O h1 é o título do conteúdo (#371).
  await expect(page.getByRole('heading', { level: 2, name: 'Versões' })).toBeVisible();
  const title = (await page.getByRole('heading', { level: 1 }).textContent()) ?? '';
  expect(title).not.toBe('');
  await expectTrail(['Sites', SITE_NAME, 'Conteúdos', title]);
  const versionsPath = new URL(page.url()).pathname;

  await page.goto(`${versionsPath}/editar`);
  await expectTrail(['Sites', SITE_NAME, 'Conteúdos', title, 'Editar']);
  await expect(trail.getByRole('link', { name: title })).toHaveAttribute('href', versionsPath);

  await page.goto(`${versionsPath}/versoes/1`);
  await expectTrail(['Sites', SITE_NAME, 'Conteúdos', title, 'Versão 1']);
});
