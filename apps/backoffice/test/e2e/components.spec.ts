import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

// Vitrine dos componentes do Ecme (#205; workspace#45): cada componente portado auditado com
// axe e teclado nos dois temas, renderizado no servidor sem aviso de hidratação. Com movimento
// reduzido, o MotionConfig do layout desliga as animações de transform do `motion`.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag22aa'];
const SHOWCASE = '/teste-de-componentes';

async function login(page: Page): Promise<void> {
  await page.goto('/sites');
  await page.getByRole('link', { name: 'editor@orakel.local' }).click();
  await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();
}

/** Erros e avisos de hidratação (em produção, os erros minificados #418, #423 e #425). */
function hydrationMessages(page: Page): string[] {
  const messages: string[] = [];
  page.on('console', (message) => {
    if (/hydrat|#418|#423|#425/i.test(message.text())) messages.push(message.text());
  });
  page.on('pageerror', (error) => messages.push(error.message));
  return messages;
}

/** Leva o foco até o controle só com Tab (no máximo 60 passos). */
async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let step = 0; step < 60; step += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('O controle não recebeu o foco pelo teclado');
}

const section = (page: Page, name: string) => page.getByRole('region', { name });

for (const colorScheme of ['light', 'dark'] as const) {
  test(`vitrine sem violações do axe, com foco de 2px e alvos de 24 px (${colorScheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await login(page);
    const hydration = hydrationMessages(page);
    await page.goto(SHOWCASE);
    await expect(page.getByRole('heading', { name: 'Teste de componentes' })).toBeVisible();
    await page.waitForLoadState('networkidle');

    const accessibility = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(accessibility.violations).toEqual([]);

    const buttons = section(page, 'Button').getByRole('button');
    expect(await buttons.count()).toBeGreaterThanOrEqual(8);
    for (const button of await buttons.all()) {
      const box = await button.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(24);
      expect(box?.height).toBeGreaterThanOrEqual(24);
    }

    // Foco do teclado: o contorno --ring de 2px da regra global, também no Button do Ecme.
    const ring = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--ring)';
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });
    for (const name of ['Solid', 'Default', 'Só ícone', 'Carregando']) {
      const button = page.getByRole('button', { name });
      await tabTo(page, button);
      expect(
        await button.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            color: style.outlineColor,
            style: style.outlineStyle,
            width: style.outlineWidth,
          };
        }),
      ).toEqual({ color: ring, style: 'solid', width: '2px' });
    }

    expect(hydration).toEqual([]);
  });
}

test('a vitrine vem renderizada do servidor', async ({ page }) => {
  await login(page);
  const response = await page.request.get(SHOWCASE);
  expect(response.status()).toBe(200);
  const html = await response.text();
  for (const text of ['Teste de componentes', 'Solid', 'Carregando exemplo', 'Painel animado']) {
    expect(html).toContain(text);
  }
});

test('Button aciona com Enter e com Espaço; desabilitado fica fora do Tab', async ({ page }) => {
  await login(page);
  await page.goto(SHOWCASE);
  await page.waitForLoadState('networkidle');
  const status = section(page, 'Button').getByRole('status');
  const solid = page.getByRole('button', { name: 'Solid' });

  await tabTo(page, solid);
  await page.keyboard.press('Enter');
  await expect(status).toHaveText('Solid acionado 1 vez(es).');
  await page.keyboard.press('Space');
  await expect(status).toHaveText('Solid acionado 2 vez(es).');

  await expect(page.getByRole('button', { name: 'Desabilitado' })).toBeDisabled();
  const loading = page.getByRole('button', { name: 'Carregando' });
  await expect(loading).toHaveAttribute('aria-busy', 'true');
  await expect(loading).toHaveAttribute('aria-disabled', 'true');

  // Do "Default" em diante, o Tab pula o desabilitado: o próximo é o "Extra pequeno".
  await tabTo(page, page.getByRole('button', { name: 'Carregando' }));
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Extra pequeno' })).toBeFocused();
});

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`movimento: o motion ${reducedMotion === 'reduce' ? 'não anima' : 'anima'} com reducedMotion ${reducedMotion}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await login(page);
    await page.goto(SHOWCASE);
    const panel = page.locator('[data-vitrine-movimento]');
    await expect(panel).toBeVisible();
    await page.waitForLoadState('networkidle');

    // Logo após a hidratação, a animação de 3 s ainda estaria no meio do caminho.
    const offset = await panel.evaluate(
      (element) => new DOMMatrix(getComputedStyle(element).transform).m41,
    );
    if (reducedMotion === 'reduce') expect(offset).toBe(0);
    else expect(offset).toBeLessThan(0);
  });
}
