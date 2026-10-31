import { expect, test, type Locator, type Page } from '@playwright/test';

import { asRole } from './auth.ts';
import { expectNoViolations } from './axe.ts';

// Cabeçalho da área autenticada (#170): "Sair", no menu de perfil (#239), encerra a sessão do
// Access só com o teclado. O "Pular para o conteúdo", a marca e o menu de perfil (teclado e axe)
// ficam nos testes de componente (`src/app/(admin)/layout.browser.test.tsx`,
// `CollapsibleSide.browser.test.tsx` e `UserProfileDropdown.browser.test.tsx`, #476).

/** Leva o foco até o controle só com Tab (no máximo 80 passos). */
async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let step = 0; step < 80; step += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('O controle não recebeu o foco pelo teclado');
}

const profile = (page: Page) => page.getByRole('button', { name: /^Perfil de / });

test(
  '"Sair", no menu de perfil, encerra a sessão do Access só com o teclado',
  { tag: '@stack' },
  async ({ page }) => {
    // A sessão do Access de verdade (cookie pelo login do mock), não a do asRole.
    await page.goto('/sites');
    await page.getByRole('link', { name: 'editor@orakel.local' }).click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('banner')).toContainText('editor@orakel.local · editor');
    await expect(page.getByRole('link', { name: 'Sair' })).toHaveCount(0);

    await tabTo(page, profile(page));
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu');
    await expect(menu).toContainText('editor@orakel.local');
    const logout = menu.getByRole('menuitem', { name: 'Sair' });
    await expect(logout).toHaveAttribute('href', '/cdn-cgi/access/logout');
    await page.keyboard.press('ArrowDown');
    await expect(logout).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/cdn-cgi\/access\/login/);

    await page.goto('/sites');
    await expect(page).toHaveURL(/\/cdn-cgi\/access\/login/);
    await expect(page.getByRole('link', { name: 'editor@orakel.local' })).toBeVisible();
  },
);

// Moldura CollapsibleSide (#237): SideNav e Header em /sites, numa tela de site e no 404; as
// áreas do site já no HTML do servidor; e sem violação do axe. O item atual pelo endereço fica
// em `CollapsibleSide.browser.test.tsx` (#476).

test('a moldura aparece em /sites, numa tela de site e no 404, com e-mail e papéis no banner', async ({
  page,
}) => {
  await asRole(page, 'editor');
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

test('o HTML do servidor já traz as áreas do site, com a atual marcada', async ({ page }) => {
  await asRole(page, 'editor');
  const html = await (await page.request.get('/sites/exemplo-a/autores/novo')).text();
  expect(html).toContain('aria-label="Áreas do site"');
  for (const area of ['Visão geral', 'Conteúdos', 'Mídia', 'Textos institucionais']) {
    expect(html).toContain(`<span>${area}</span>`);
  }
  expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/sites\/exemplo-a\/autores"/);
});

test(`a moldura sem violação do axe`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await asRole(page, 'editor');
  for (const path of ['/sites', '/sites/exemplo-a/autores']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expectNoViolations(page, { include: ['.side-nav', '.header'] });
  }
});
