import { expect, test, type Locator, type Page } from '@playwright/test';

// Foco visível (#85): navegando só com Tab, link, campo e botão mostram o contorno --ring
// de 2px, vindo da regra global de globals.css, nos dois temas. O "Pular para o conteúdo"
// (#170), primeira parada do Tab, também.

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

/** A cor de --ring como o navegador a calcula, para comparar com o outline-color. */
async function ringColor(page: Page): Promise<string> {
  return page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--ring)';
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
}

async function outline(target: Locator) {
  return target.evaluate((element) => {
    const style = getComputedStyle(element);
    return { color: style.outlineColor, style: style.outlineStyle, width: style.outlineWidth };
  });
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`link, campo e botão mostram o contorno --ring ao receber foco pelo teclado (${colorScheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await loginAs(page, 'editor@orakel.local');
    await page.goto('/sites/exemplo-a/autores/novo');
    const main = page.getByRole('main');
    const ring = await ringColor(page);

    const targets = [
      page.getByRole('link', { name: 'Pular para o conteúdo' }),
      // Link da trilha (#243), com as classes do Ecme.
      main.getByRole('navigation', { name: 'Trilha de navegação' }).getByRole('link').first(),
      main.getByLabel('Nome', { exact: true }),
      main.getByRole('button', { name: 'Criar', exact: true }),
    ];
    for (const target of targets) {
      await tabTo(page, target);
      // O Input do Ecme (#245) tem `transition`, que no Tailwind 4 inclui `outline-color`: a cor
      // chega ao --ring depois da transição.
      await expect
        .poll(() => outline(target))
        .toEqual({ color: ring, style: 'solid', width: '2px' });
    }
  });
}
