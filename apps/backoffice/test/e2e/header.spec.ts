import AxeBuilder from '@axe-core/playwright';
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

// Moldura CollapsibleSide (#237): SideNav e Header em /sites, numa tela de site e no 404; as
// áreas do site já no HTML do servidor; sem áreas no 404 de site nem em /sites/novo; e sem
// violação do axe nos dois temas.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag22aa'];

test('a moldura aparece em /sites, numa tela de site e no 404, com e-mail e papéis no banner', async ({
  page,
}) => {
  await loginAs(page, 'editor@orakel.local');
  for (const path of ['/sites', '/sites/exemplo-a/conteudos', '/sites/inexistente']) {
    await page.goto(path);
    await expect(page.getByRole('banner')).toContainText('editor@orakel.local · editor');
    await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Orakel Backoffice' })).toHaveAttribute(
      'href',
      '/sites',
    );
  }
});

test('"Sites" é o item atual de "Principal" em /sites e /sites/novo, sem as áreas do site', async ({
  page,
}) => {
  await loginAs(page, 'admin@orakel.local');
  const principal = page.getByRole('navigation', { name: 'Principal' });
  for (const path of ['/sites', '/sites/novo', '/sites/inexistente']) {
    await page.goto(path);
    await expect(page.getByRole('navigation', { name: 'Áreas do site' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /trocar de site/ })).toHaveCount(0);
    if (path !== '/sites/inexistente') {
      await expect(principal.getByRole('link', { name: 'Sites' })).toHaveAttribute(
        'aria-current',
        'page',
      );
    }
  }
  await page.goto('/sites/exemplo-a');
  await expect(page.getByRole('navigation', { name: 'Áreas do site' })).toBeVisible();
  await expect(principal.getByRole('link', { name: 'Sites' })).not.toHaveAttribute('aria-current');
});

test('o HTML do servidor já traz as áreas do site, com a atual marcada', async ({ page }) => {
  await loginAs(page, 'editor@orakel.local');
  const html = await (await page.request.get('/sites/exemplo-a/autores/novo')).text();
  expect(html).toContain('aria-label="Áreas do site"');
  for (const area of ['Visão geral', 'Conteúdos', 'Mídia', 'Textos institucionais']) {
    expect(html).toContain(`<span>${area}</span>`);
  }
  expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/sites\/exemplo-a\/autores"/);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`a moldura sem violação do axe (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await loginAs(page, 'editor@orakel.local');
    for (const path of ['/sites', '/sites/exemplo-a/autores']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const accessibility = await new AxeBuilder({ page })
        .withTags(WCAG)
        .include('.side-nav')
        .include('.header')
        .analyze();
      expect(accessibility.violations).toEqual([]);
    }
  });
}
