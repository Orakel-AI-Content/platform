import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// E2E contra o ambiente local (pnpm local:up && pnpm local:seed): Caddy + access-mock +
// backoffice-web. O fluxo completo (site → autor → imagem → artigo → revisão → build)
// entra com os módulos Conteúdo, Mídia, Revisão e Publicação.

test('login pelo Access e registro de instâncias', async ({ page }) => {
  await page.goto('/sites');

  // Sem sessão, o Access (access-mock) pede login.
  await expect(page.getByRole('heading', { name: /Login de teste/ })).toBeVisible();
  await page.getByRole('link', { name: 'operacao@orakel.local' }).click();

  await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();
  await expect(page.getByText('operacao@orakel.local · operacao')).toBeVisible();
  const table = page.getByRole('table');
  await expect(table.getByRole('cell', { name: 'exemplo-a', exact: true })).toBeVisible();
  await expect(table.getByRole('cell', { name: 'exemplo-b', exact: true })).toBeVisible();

  // Operação enfileira o build do site sem esperar a janela (12.0, L3).
  await page.getByRole('button', { name: 'Publicar agora exemplo-a' }).click();
  await expect(page.getByText('Build de exemplo-a enfileirado.')).toBeVisible();

  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test('a API de exportação não existe no hostname público', async ({ request }) => {
  const response = await request.get('/api/export/v1/sites/exemplo-a/snapshot', {
    headers: { authorization: 'Bearer local-build-token-0000000000000000' },
  });
  expect(response.status()).toBe(404);
});
