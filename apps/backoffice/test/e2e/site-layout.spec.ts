import { expect, test, type Page } from '@playwright/test';

// Layout do site (#78, workspace#32) contra o ambiente local: título da aba com a área e o
// site, "não encontrado" de site e de item com o link certo e status 404, e o carregamento
// entre áreas do mesmo site com o cabeçalho visível.

const OPERATOR = 'operacao@orakel.local';
const SITE = 'exemplo-a';
const SITE_NAME = 'Exemplo A — Guias';

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
