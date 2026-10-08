import { expect, test, type Locator, type Page } from '@playwright/test';

// Cabeçalho da área autenticada (#170): "Pular para o conteúdo" como primeira parada do Tab,
// a marca levando a /sites e "Sair" encerrando a sessão do Access, tudo só com o teclado.

async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto('/sites');
  await page.getByRole('link', { name: email }).click();
  await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();
}

/** Leva o foco até o controle só com Tab (no máximo 80 passos). */
async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let step = 0; step < 80; step += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('O controle não recebeu o foco pelo teclado');
}

test('a primeira parada do Tab é "Pular para o conteúdo", que leva o foco ao <main>', async ({
  page,
}) => {
  await loginAs(page, 'editor@orakel.local');

  for (const path of ['/sites', '/sites/exemplo-a/conteudos']) {
    await page.goto(path);
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Pular para o conteúdo' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();

    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
    // O Tab seguinte já é do conteúdo, não do cabeçalho.
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() => document.querySelector('main')?.contains(document.activeElement)),
    ).toBe(true);
  }
});

test('a marca "Orakel Backoffice" leva à lista de sites', async ({ page }) => {
  await loginAs(page, 'editor@orakel.local');
  await page.goto('/sites/exemplo-a/conteudos');

  await tabTo(page, page.getByRole('link', { name: 'Orakel Backoffice' }));
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/sites$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Sites' })).toBeVisible();
});

test('"Sair" encerra a sessão do Access: o próximo acesso pede login', async ({ page }) => {
  await loginAs(page, 'editor@orakel.local');
  const logout = page.getByRole('link', { name: 'Sair' });
  await expect(logout).toHaveAttribute('href', '/cdn-cgi/access/logout');

  await tabTo(page, logout);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/cdn-cgi\/access\/login/);

  await page.goto('/sites');
  await expect(page).toHaveURL(/\/cdn-cgi\/access\/login/);
  await expect(page.getByRole('link', { name: 'editor@orakel.local' })).toBeVisible();
});
