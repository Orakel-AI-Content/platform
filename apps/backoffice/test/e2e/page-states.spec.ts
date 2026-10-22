import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Telas de estado do Backoffice (#77, workspace#32) contra o ambiente local: "não encontrado"
// e erro dentro do layout, com o cabeçalho, e o carregamento na navegação. A tela de erro usa
// a página /teste-de-erro, ligada só no local (E2E_ERROR_ROUTE no compose).

const OPERATOR = 'operacao@orakel.local';

async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto('/sites');
  await page.getByRole('link', { name: email }).click();
  await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
}

test(
  'endereço inexistente mostra "não encontrado" com o cabeçalho e status 404',
  { tag: '@smoke' },
  async ({ page }) => {
    await loginAs(page, OPERATOR);

    for (const path of ['/qualquer', '/sites/inexistente', '/sites/exemplo-a/nada/aqui']) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
      await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
      await expect(page.getByRole('banner')).toContainText(OPERATOR);
    }

    await page.getByRole('link', { name: 'Ir para a lista de sites' }).click();
    await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();
  },
);

// Telas de estado no visual do Ecme (#283), nos dois temas.
for (const colorScheme of ['light', 'dark'] as const) {
  test(`"não encontrado" sem violação do axe (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await loginAs(page, OPERATOR);
    for (const path of ['/qualquer', '/sites/exemplo-a/nada/aqui']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${colorScheme}\\b`));
      await expectNoAxeViolations(page);
    }
  });

  test(`tela de erro sem violação do axe (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await loginAs(page, OPERATOR);
    await page.goto('/teste-de-erro');
    await expect(page.getByRole('heading', { name: 'Algo deu errado' })).toBeVisible();
    await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${colorScheme}\\b`));
    await expectNoAxeViolations(page);
  });
}

test('exceção numa página mostra a tela de erro, e "Tentar de novo" busca de novo', async ({
  page,
}) => {
  await loginAs(page, OPERATOR);

  await page.goto('/teste-de-erro');
  await expect(page.getByRole('heading', { name: 'Algo deu errado' })).toBeVisible();
  await expect(page.getByRole('banner')).toContainText(OPERATOR);
  await expect(page.getByText(/Código do erro: \S+/)).toBeVisible();
  // A mensagem da exceção fica só nos logs.
  await expect(page.getByText('Erro provocado pelo E2E')).toHaveCount(0);

  // A página falha sempre: o retry busca de novo e a tela de erro volta.
  const refetch = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === '/teste-de-erro' && request.headers()['rsc'] === '1',
  );
  await page.getByRole('button', { name: 'Tentar de novo' }).click();
  await refetch;
  await expect(page.getByRole('heading', { name: 'Algo deu errado' })).toBeVisible();
});

test('a navegação mostra o carregamento, anunciado, em até 100 ms', async ({ page }) => {
  await loginAs(page, OPERATOR);
  await page.waitForLoadState('networkidle');

  // Segura a resposta da próxima tela (não o prefetch) para o carregamento ficar visível.
  await page.route(
    (url) => url.pathname === '/sites/exemplo-a',
    async (route) => {
      const headers = route.request().headers();
      if (headers['rsc'] === '1' && headers['next-router-prefetch'] === undefined) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      await route.continue();
    },
  );

  // Mede no navegador: do clique ao indicador em role="status".
  await page.evaluate(() => {
    const marks = window as unknown as { clickAt?: number; loadingAt?: number };
    document.addEventListener('click', () => (marks.clickAt = performance.now()), {
      capture: true,
      once: true,
    });
    new MutationObserver((_, observer) => {
      const loading = [...document.querySelectorAll('[role="status"]')].some((element) =>
        element.textContent.includes('Carregando'),
      );
      if (loading) {
        marks.loadingAt = performance.now();
        observer.disconnect();
      }
    }).observe(document.body, { childList: true, subtree: true });
  });

  await page.getByRole('link', { name: 'Exemplo A — Guias' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Carregando' })).toBeVisible();
  const elapsed = await page.evaluate(() => {
    const marks = window as unknown as { clickAt?: number; loadingAt?: number };
    return (marks.loadingAt ?? Infinity) - (marks.clickAt ?? 0);
  });
  expect(elapsed).toBeLessThan(100);

  // O h1 da tela do site é o nome dele (trilha única, #178).
  await expect(page.getByRole('heading', { level: 1, name: 'Exemplo A — Guias' })).toBeVisible();
});
