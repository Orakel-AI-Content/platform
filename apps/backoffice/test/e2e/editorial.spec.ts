import { expect, test } from '@playwright/test';

import { asRole } from './auth.ts';
import { fieldLabel } from './fieldLabel.ts';
import { chooseOption } from './select.ts';

// Fluxo crítico do editorial (ADR 0019 da raiz): o editor cria autor e categoria pelas telas e
// os escolhe no editor de artigos. O item novo, no fim da ordem por ID, é achado pela busca (o
// banco local acumula itens entre rodadas). Listas, menus, textos institucionais e a aparência
// ficam nos testes de componente.

test(
  'editor cria autor e categoria e os escolhe no editor de artigos',
  { tag: '@smoke' },
  async ({ page }) => {
    const stamp = Date.now();
    const author = `Autora ${stamp}`;
    const category = `Categoria ${stamp}`;
    await asRole(page, 'editor');

    await page.goto('/sites/exemplo-a/autores');
    // A ação fica no cabeçalho e, com a lista vazia, também no estado vazio (#87).
    await page.getByRole('link', { name: 'Criar autor' }).first().click();
    await expect(page.getByRole('heading', { name: 'Criar autor' })).toBeVisible();
    // "Nome" exato: a lista também tem "Buscar por nome" (#108).
    await page.getByLabel(fieldLabel('Nome')).fill(author);
    await page.getByLabel('Slug').fill(`autora-${stamp}`);
    await page.getByRole('button', { name: 'Criar' }).click();
    await expect(page).toHaveURL(/\/sites\/exemplo-a\/autores$/);
    await page.getByLabel('Buscar por nome').fill(author);
    await expect(page.getByRole('row', { name: new RegExp(author) })).toBeVisible();

    // Slug repetido: a recusa do domínio aparece junto do campo.
    await page.getByRole('link', { name: 'Criar autor' }).first().click();
    await expect(page.getByRole('heading', { name: 'Criar autor' })).toBeVisible();
    await page.getByLabel(fieldLabel('Nome')).fill('Outra');
    await page.getByLabel('Slug').fill(`autora-${stamp}`);
    await page.getByRole('button', { name: 'Criar' }).click();
    await expect(page.getByLabel('Slug')).toHaveAttribute('aria-invalid', 'true');
    await expect(page).toHaveURL(/\/autores\/novo$/);

    await page.goto('/sites/exemplo-a/taxonomias');
    await page.getByRole('link', { name: 'Criar taxonomia' }).first().click();
    await expect(page.getByRole('heading', { name: 'Criar taxonomia' })).toBeVisible();
    await chooseOption(page.getByRole('combobox', { name: fieldLabel('Tipo') }), 'Categoria');
    await page.getByLabel(fieldLabel('Nome')).fill(category);
    await page.getByLabel('Slug').fill(`categoria-${stamp}`);
    await page.getByRole('button', { name: 'Criar' }).click();
    await expect(page).toHaveURL(/\/sites\/exemplo-a\/taxonomias$/);
    await page.getByLabel('Buscar por nome').fill(category);
    await expect(page.getByRole('row', { name: new RegExp(category) })).toContainText('Categoria');

    await page.goto('/sites/exemplo-a/conteudos/novo');
    await chooseOption(page.getByRole('combobox', { name: fieldLabel('Autores') }), author);
    await chooseOption(
      page.getByRole('combobox', { name: fieldLabel('Taxonomias') }),
      `${category} (categoria)`,
    );
    await expect(page.getByRole('button', { name: `Remover ${author}` })).toBeVisible();
    await expect(
      page.getByRole('button', { name: `Remover ${category} (categoria)` }),
    ).toBeVisible();
  },
);
