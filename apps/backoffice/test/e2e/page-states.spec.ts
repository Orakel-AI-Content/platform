import { expect, test } from '@playwright/test';

import { asRole } from './auth.ts';

// "Não encontrado" dentro do layout, com o status 404 (#77). A tela de erro, o carregamento e a
// aparência ficam nos testes de componente.

test(
  'endereço inexistente mostra "não encontrado" com o cabeçalho e status 404',
  { tag: '@smoke' },
  async ({ page }) => {
    await asRole(page, 'operacao');

    for (const path of ['/qualquer', '/sites/inexistente', '/sites/exemplo-a/nada/aqui']) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
      await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
    }

    await page.getByRole('link', { name: 'Ir para a lista de sites' }).click();
    await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();
  },
);
