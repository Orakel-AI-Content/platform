import { expect, test, type Page } from '@playwright/test';

// Fonte do Ecme (#202): o texto do Backoffice renderiza em Inter, servida pelo próprio
// Backoffice (next/font/local). Nenhuma tela pede nada ao Google Fonts, nem no carregamento.

const GOOGLE_FONTS = /^https?:\/\/fonts\.(?:googleapis|gstatic)\.com\//;

async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto('/sites');
  await page.getByRole('link', { name: email }).click();
  await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();
}

test('o texto renderiza em Inter, sem requisição ao Google Fonts', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    if (GOOGLE_FONTS.test(request.url())) external.push(request.url());
  });

  await loginAs(page, 'editor@orakel.local');

  for (const path of ['/sites', '/sites/exemplo-a/conteudos']) {
    await page.goto(path);
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();

    // A pilha do body começa pela família do next/font, que só carrega o .woff2 local.
    const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(family.toLowerCase(), path).toMatch(/^"?inter"?,/);
    const loaded = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts]
        .filter((face) => face.status === 'loaded')
        .map((face) => face.family.replaceAll('"', '').toLowerCase());
    });
    expect(loaded, path).toContain('inter');
  }

  expect(external).toEqual([]);
});
