// Degrau 2 no navegador real (@orakel/elements): menu mobile, copiar link e compartilhar.
// Os elementos só acrescentam comportamento; sem eles, o degrau 1 continua funcionando.
import { expect, test } from '@playwright/test';

import { SERVERS } from '../playwright.config.ts';

test.beforeEach(async ({ page }) => {
  await page.route(/media\.|\/_e\//, (route) => route.abort());
});

test('menu mobile: Esc fecha e devolve o foco; clique fora fecha', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(`${SERVERS['exemplo-a']}/`);
  const details = page.locator('ok-menu details');
  const summary = details.locator('summary');

  await summary.click();
  await expect(details).toHaveAttribute('open', '');
  await details.getByRole('link').first().focus();
  await page.keyboard.press('Escape');
  await expect(details).not.toHaveAttribute('open', '');
  await expect(summary).toBeFocused();

  await summary.click();
  await page.locator('main').click({ position: { x: 5, y: 5 } });
  await expect(details).not.toHaveAttribute('open', '');
});

test('copiar link: mostra o botão, copia a URL do artigo e anuncia', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(`${SERVERS['exemplo-a']}/guia-completo/`);
  const button = page.getByRole('button', { name: 'Copiar link' });
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.getByRole('status').filter({ hasText: 'Link copiado' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'https://exemplo-a.com.br/guia-completo/',
  );
});

test('compartilhar: o botão aparece só com a Web Share API', async ({ page }) => {
  await page.goto(`${SERVERS['exemplo-b']}/arroz-de-forno/`);
  const hasShare = await page.evaluate(() => 'share' in navigator);
  await expect(page.locator('button[data-ok-share]')).toBeVisible({ visible: hasShare });
});

test('sem JavaScript, o degrau 1 continua: link selecionável e botões ocultos', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${SERVERS['exemplo-a']}/guia-completo/`);
  await expect(page.getByLabel('Link deste artigo')).toHaveValue(
    'https://exemplo-a.com.br/guia-completo/',
  );
  await expect(page.locator('button[data-ok-copy]')).toBeHidden();
  await context.close();
});
