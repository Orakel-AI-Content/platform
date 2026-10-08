import { expect, test, type Page } from '@playwright/test';

// Layout do site (#78, workspace#32) contra o ambiente local: título da aba com a área e o
// site, "não encontrado" de site e de item com o link certo e status 404, o carregamento
// entre áreas do mesmo site com o cabeçalho visível e a barra lateral de áreas (#171).

const OPERATOR = 'operacao@orakel.local';
const SITE = 'exemplo-a';
const SITE_NAME = 'Exemplo A — Guias';

const AREAS = ['Visão geral', 'Conteúdos', 'Revisão', 'Mídia', 'Autores', 'Taxonomias', 'Menus'];

async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto('/sites');
  await page.getByRole('link', { name: email }).click();
  await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();
}

test('a aba mostra a área e, dentro de um site, o nome dele', async ({ page }) => {
  await loginAs(page, OPERATOR);
  await expect(page).toHaveTitle('Sites · Orakel Backoffice');

  await page.goto('/sites/novo');
  await expect(page).toHaveTitle('Cadastrar site · Orakel Backoffice');

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
  await loginAs(page, OPERATOR);

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
  await page.getByRole('link', { name: `Ir para o site ${SITE}` }).click();
  await expect(page).toHaveURL(new RegExp(`/sites/${SITE}$`));
  await expect(page.getByRole('heading', { level: 1 })).toContainText(SITE_NAME);
});

test('entre áreas do mesmo site, o carregamento aparece com o cabeçalho visível', async ({
  page,
}) => {
  await loginAs(page, OPERATOR);
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
  await loginAs(page, OPERATOR);
  await page.goto(`/sites/${SITE}`);
  const bar = page.getByRole('navigation', { name: 'Áreas do site' });
  await expect(bar.getByRole('link')).toHaveText(AREAS);
  // A página do site não repete as áreas; "Editar configuração" continua nela.
  await expect(page.getByRole('link', { name: 'Autores', exact: true })).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Editar configuração' })).toBeVisible();
});

test('com content.write, a barra também tem Textos institucionais', async ({ page }) => {
  await loginAs(page, 'editor@orakel.local');
  await page.goto(`/sites/${SITE}/midia`);
  await expect(
    page.getByRole('navigation', { name: 'Áreas do site' }).getByRole('link'),
  ).toHaveText([...AREAS, 'Textos institucionais']);
});

test('a área atual tem aria-current, também em telas de item, criar e editar', async ({ page }) => {
  await loginAs(page, 'editor@orakel.local');
  const bar = page.getByRole('navigation', { name: 'Áreas do site' });
  const current = bar.locator('[aria-current="page"]');

  for (const [path, area] of [
    ['', 'Visão geral'],
    ['/autores', 'Autores'],
    ['/autores/novo', 'Autores'],
    ['/conteudos/novo', 'Conteúdos'],
    ['/revisao', 'Revisão'],
    ['/configuracao', 'Visão geral'],
  ] as const) {
    await page.goto(`/sites/${SITE}${path}`);
    await expect(current).toHaveCount(1);
    await expect(current).toHaveText(area);
  }
});

test('a barra é navegável só com teclado', async ({ page }) => {
  await loginAs(page, OPERATOR);
  await page.goto(`/sites/${SITE}`);
  const taxonomies = page
    .getByRole('navigation', { name: 'Áreas do site' })
    .getByRole('link', { name: 'Taxonomias' });

  for (let step = 0; step < 40; step += 1) {
    if (await taxonomies.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expect(taxonomies).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(new RegExp(`/sites/${SITE}/taxonomias$`));
  await expect(taxonomies).toHaveAttribute('aria-current', 'page');
});

test('trilha única nas telas de site e de área, com o h1 sem o id do site', async ({ page }) => {
  await loginAs(page, 'admin@orakel.local');
  const trail = page.getByRole('navigation', { name: 'Trilha de navegação' });

  for (const [path, items, heading] of [
    ['/sites/novo', ['Sites', 'Cadastrar site'], 'Cadastrar site'],
    [`/sites/${SITE}`, ['Sites', SITE_NAME], SITE_NAME],
    [`/sites/${SITE}/configuracao`, ['Sites', SITE_NAME, 'Configuração'], 'Configuração'],
    [`/sites/${SITE}/pendencias`, ['Sites', SITE_NAME, 'Mudanças pendentes'], 'Mudanças pendentes'],
    [`/sites/${SITE}/conteudos`, ['Sites', SITE_NAME, 'Conteúdos'], 'Conteúdos'],
    [`/sites/${SITE}/revisao`, ['Sites', SITE_NAME, 'Revisão'], 'Revisão'],
    [`/sites/${SITE}/midia`, ['Sites', SITE_NAME, 'Mídia'], 'Mídia'],
    [`/sites/${SITE}/autores`, ['Sites', SITE_NAME, 'Autores'], 'Autores'],
    [`/sites/${SITE}/taxonomias`, ['Sites', SITE_NAME, 'Taxonomias'], 'Taxonomias'],
    [`/sites/${SITE}/menus`, ['Sites', SITE_NAME, 'Menus'], 'Menus'],
    [
      `/sites/${SITE}/institucionais`,
      ['Sites', SITE_NAME, 'Textos institucionais'],
      'Textos institucionais',
    ],
  ] as const) {
    await page.goto(path);
    await expect(trail.getByRole('listitem')).toHaveText(
      items.map((item, index) => (index === 0 ? item : `›${item}`)),
    );
    // Todos os itens, menos o último, são links; o último é a tela atual.
    await expect(trail.getByRole('link')).toHaveCount(items.length - 1);
    await expect(trail.locator('[aria-current="page"]')).toHaveText(items.at(-1) ?? '');
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toHaveText(heading);
    await expect(h1).not.toContainText(`(${SITE})`);
    // A trilha fica acima do título.
    expect(
      await trail.evaluate(
        (nav, title) =>
          Boolean(nav.compareDocumentPosition(title as Node) & Node.DOCUMENT_POSITION_FOLLOWING),
        await h1.elementHandle(),
      ),
    ).toBe(true);
  }
});
