import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

import { asRole } from './auth.ts';

// Vitrine dos componentes do Ecme (#205; workspace#45), no E2E só com o que depende do servidor
// (#459): a página renderizada no servidor sem aviso de hidratação, a Pagination com links lida
// da URL no servidor (`?pagina-link=`) e o axe da página inteira no tema claro, com foco de 2px
// e alvos de 24 px. Teclado, foco, axe nos dois temas e movimento de cada componente ficam nos
// testes de componente em Chromium (`src/**/*.browser.test.tsx`, #457 a #459).

const WCAG = ['wcag2a', 'wcag2aa', 'wcag22aa'];

/**
 * Auditoria do axe na página. Os "focus guards" do floating-ui (#210: Dropdown; também o
 * Tooltip e o DataTable) ficam de fora: são <span tabindex="0" aria-hidden="true"> invisíveis que
 * o FloatingPortal e o FloatingFocusManager criam para manter a ordem do Tab com o menu no fim do
 * <body>, e que repassam o foco na hora. O axe os acusa (`aria-hidden-focus`); desligá-los faria
 * o Tab sair da página a partir do menu (decisão no escalonamento da #210).
 */
const audit = (page: Page) =>
  new AxeBuilder({ page }).withTags(WCAG).exclude('[data-floating-ui-focus-guard]').analyze();
const SHOWCASE = '/teste-de-componentes';

/** Erros e avisos de hidratação (em produção, os erros minificados #418, #423 e #425). */
function hydrationMessages(page: Page): string[] {
  const messages: string[] = [];
  page.on('console', (message) => {
    if (/hydrat|#418|#423|#425/i.test(message.text())) messages.push(message.text());
  });
  page.on('pageerror', (error) => messages.push(error.message));
  return messages;
}

/** Leva o foco até o controle só com Tab (no máximo 300 passos: a vitrine cresce a cada Task). */
async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let step = 0; step < 300; step += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('O controle não recebeu o foco pelo teclado');
}

const section = (page: Page, name: string) => page.getByRole('region', { name });

test('vitrine sem violações do axe, com foco de 2px e alvos de 24 px (light)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await asRole(page, 'editor');
  const hydration = hydrationMessages(page);
  await page.goto(SHOWCASE);
  await expect(page.getByRole('heading', { name: 'Teste de componentes' })).toBeVisible();
  await page.waitForLoadState('networkidle');

  const accessibility = await audit(page);
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

test('a vitrine vem renderizada do servidor', { tag: '@smoke' }, async ({ page }) => {
  await asRole(page, 'editor');
  const response = await page.request.get(SHOWCASE);
  expect(response.status()).toBe(200);
  const html = await response.text();
  for (const text of [
    'Teste de componentes',
    'Solid',
    'Carregando exemplo',
    'Painel animado',
    'Resumo',
    'https://',
    'O slug já está em uso',
    'Destaque na capa',
    'Copiar link',
    'Escolha a categoria',
    'Guia de jardinagem',
    'Nome, domínio e idioma do site.',
  ]) {
    expect(html).toContain(text);
  }
});

// Pagination (#214) no modo link (getPageHref): a página vem de ?pagina-link= (o ?pagina= é do
// DataTable, #215) e os links funcionam renderizados no servidor.

const paginations = (page: Page) =>
  section(page, 'Pagination').getByRole('navigation', { name: 'Paginação' });

test('Pagination com links: ?pagina-link= no servidor, ponta sem href e Enter navega', async ({
  page,
}) => {
  await asRole(page, 'editor');
  const response = await page.request.get(`${SHOWCASE}?pagina-link=7`);
  const html = await response.text();
  expect(html).toContain('href="/teste-de-componentes?pagina-link=8"');
  expect(html).toMatch(
    /<a[^>]*aria-current="page"[^>]*href="\/teste-de-componentes\?pagina-link=7"/,
  );

  await page.goto(`${SHOWCASE}?pagina-link=20`);
  await page.waitForLoadState('networkidle');
  const nav = paginations(page).last();

  await expect(nav.getByRole('link', { name: 'Página 20' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  const next = nav.getByRole('link', { name: 'Próxima página' });
  await expect(next).toHaveAttribute('aria-disabled', 'true');
  await expect(next).not.toHaveAttribute('href');
  await expect(nav.getByRole('link', { name: 'Voltar 5 páginas' })).toHaveAttribute(
    'href',
    '/teste-de-componentes?pagina-link=15',
  );

  for (const control of await nav.getByRole('link').all()) {
    const box = await control.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(24);
    expect(box?.height).toBeGreaterThanOrEqual(24);
  }

  const prev = nav.getByRole('link', { name: 'Página anterior' });
  await tabTo(page, prev);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\?pagina-link=19$/);
  await expect(paginations(page).last().getByRole('link', { name: 'Página 19' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});
