import { expect, test, type Page } from '@playwright/test';

import { asRole } from './auth.ts';
import { expectNoViolations as expectAxe } from './axe.ts';
import { fieldLabel } from './fieldLabel.ts';
import { chooseOption } from './select.ts';

// Autores, taxonomias, menus e textos institucionais (#46) contra o ambiente local semeado:
// o editor cria e edita pelas telas e vê o resultado; o revisor não grava. As três listas têm
// busca e paginação (#108, #363): o item novo, no fim da ordem por ID, é achado pela busca (o
// banco local acumula itens entre rodadas).

async function expectNoViolations(page: Page): Promise<void> {
  // Depois de uma navegação no cliente, o <title> chega em streaming; no `next dev` da camada
  // `telas`, depois do axe.
  await expect(page).toHaveTitle(/\S/);
  await expectAxe(page);
}

test(
  'editor cria autor e categoria e os escolhe no editor de artigos',
  { tag: '@smoke' },
  async ({ page }) => {
    const stamp = Date.now();
    const author = `Autora ${stamp}`;
    const category = `Categoria ${stamp}`;
    await asRole(page, 'editor');
    await page.goto('/sites/exemplo-a');
    const nav = page.getByRole('navigation', { name: 'Áreas do site' });

    await nav.getByRole('link', { name: 'Autores' }).click();
    // A ação fica no cabeçalho e, com a lista vazia, também no estado vazio (#87).
    await page.getByRole('link', { name: 'Criar autor' }).first().click();
    // "Nome" exato: a lista também tem "Buscar por nome" (#108).
    await expect(page.getByRole('heading', { name: 'Criar autor' })).toBeVisible();
    await page.getByLabel(fieldLabel('Nome')).fill(author);
    await page.getByLabel('Slug').fill(`autora-${stamp}`);
    await expectNoViolations(page);
    await page.getByRole('button', { name: 'Criar' }).click();
    await expect(page).toHaveURL(/\/sites\/exemplo-a\/autores$/);
    // O sucesso vai para o toast do template (#325), fora do main, e continua na lista.
    await expect(page.getByRole('status').filter({ hasText: 'Autor criado.' })).toBeVisible();
    await page.getByLabel('Buscar por nome').fill(author.toUpperCase());
    await expect(page.getByRole('row', { name: new RegExp(author) })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /resultados?$/ })).toHaveText(
      '1 resultado',
    );
    await expectNoViolations(page);

    // A URL leva a busca para outra aba.
    await expect(page).toHaveURL(/q=/);
    const other = await page.context().newPage();
    await other.goto(page.url());
    await expect(other.getByLabel('Buscar por nome')).toHaveValue(author.toUpperCase());
    await expect(other.getByRole('row', { name: new RegExp(author) })).toBeVisible();
    await other.close();

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

    // Busca sem resultado: a tabela fica com a mensagem, e "Limpar filtros" volta a lista (#361).
    await page.getByLabel('Buscar por nome').fill(`nada-${stamp}`);
    await expect(page.getByText('Nenhuma taxonomia encontrada.')).toBeVisible();
    await page.getByRole('button', { name: 'Limpar filtros' }).click();
    await expect(page.getByLabel('Buscar por nome')).toHaveValue('');
    await expect(page.getByRole('table')).toBeVisible();

    await page.goto('/sites/exemplo-a/conteudos/novo');
    await chooseOption(page.getByRole('combobox', { name: fieldLabel('Autores') }), author);
    await chooseOption(
      page.getByRole('combobox', { name: fieldLabel('Taxonomias') }),
      `${category} (categoria)`,
    );
    // No múltiplo, cada valor escolhido tem o próprio "Remover <opção>" (#319).
    await expect(page.getByRole('button', { name: `Remover ${author}` })).toBeVisible();
    await page.getByRole('combobox', { name: fieldLabel('Autores') }).press('Backspace');
    await expect(page.getByRole('button', { name: `Remover ${author}` })).toHaveCount(0);
  },
);

// Remover item de lista do SchemaForm confirma num diálogo (#327), nos dois temas: Esc não
// remove e devolve o foco; "Remover" tira o item. Nada é salvo.
test(`remover item do menu confirma, sem violação do axe`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await asRole(page, 'editor');
  await page.goto('/sites/exemplo-a/menus');
  await page.getByRole('link', { name: 'Editar principal' }).click();
  await page.waitForLoadState('networkidle');
  const labels = page.getByLabel('Rótulo');
  const count = await labels.count();
  await page.getByRole('button', { name: 'Adicionar item' }).click();
  await expect(labels).toHaveCount(count + 1);

  const remove = page.getByRole('button', { name: `Remover item ${count + 1}` });
  const dialog = page.getByRole('alertdialog', { name: `Remover item ${count + 1}?` });
  await remove.click();
  await expect(dialog).toBeVisible();
  await expectNoViolations(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(remove).toBeFocused();
  await expect(labels).toHaveCount(count + 1);
  await remove.click();
  await dialog.getByRole('button', { name: 'Remover' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(labels).toHaveCount(count);
});

// Formulário do template (#328), nos dois temas: campos em Card, Nome e Slug lado a lado a
// partir de md, a barra fixa na largura do main com Descartar (criar) ou Voltar (editar), e o
// resumo de validação do SchemaForm no Alert do Ecme (#325).
test(`formulário de autor no template, sem violação do axe`, async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await asRole(page, 'editor');
  await page.goto('/sites/exemplo-a/autores/novo');
  await expect(page.getByRole('heading', { name: 'Criar autor' })).toBeVisible();
  await page.waitForLoadState('networkidle');

  // Todo campo dentro de um Card.
  const form = page.locator('main form');
  const controls = form.locator('input:not([type=hidden]), textarea, select');
  for (const control of await controls.all()) {
    expect(await control.evaluate((el) => el.closest('.card') !== null)).toBe(true);
  }
  // Nome e Slug na mesma linha a 1280 px; um embaixo do outro a 767 px.
  const name = page.getByLabel(fieldLabel('Nome'));
  const slug = page.getByLabel('Slug');
  expect((await name.boundingBox())?.y).toBe((await slug.boundingBox())?.y);
  // A barra encosta nas bordas do main.
  const bar = page.locator('.sticky').filter({ has: page.getByRole('button', { name: 'Criar' }) });
  const main = await page.locator('main').boundingBox();
  const barBox = await bar.boundingBox();
  expect(barBox?.x).toBe(main?.x);
  expect(barBox?.width).toBe(main?.width);
  await page.setViewportSize({ width: 767, height: 800 });
  // Uma coluna: cada campo na sua linha (o schema põe o Slug antes do Nome).
  expect((await name.boundingBox())!.y).toBeGreaterThan((await slug.boundingBox())!.y);
  await page.setViewportSize({ width: 1280, height: 800 });

  // Resumo de validação: o link do campo leva o foco a ele.
  await page.getByRole('button', { name: 'Criar' }).click();
  const summary = page.getByRole('alert').filter({ hasText: 'Corrija os campos destacados:' });
  await expect(summary.locator('.alert')).toBeVisible();
  await summary.getByRole('button', { name: /^Nome:/ }).click();
  await expect(name).toBeFocused();
  await expectNoViolations(page);

  // Descartar confirma: Cancelar fica com o que foi digitado; Descartar volta à lista sem criar.
  await name.fill('Rascunho descartado');
  await page.getByRole('button', { name: 'Descartar' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Descartar o que foi preenchido?' });
  await expect(dialog).toBeVisible();
  await expectNoViolations(page);
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(name).toHaveValue('Rascunho descartado');
  await expectNoViolations(page);
  await page.getByRole('button', { name: 'Descartar' }).click();
  await dialog.getByRole('button', { name: 'Descartar' }).click();
  await expect(page).toHaveURL(/\/sites\/exemplo-a\/autores$/);
  await expect(page.getByRole('row', { name: /Rascunho descartado/ })).toHaveCount(0);
});

test('editar menu: Voltar leva à lista sem salvar', async ({ page }) => {
  await asRole(page, 'editor');
  await page.goto('/sites/exemplo-a/menus');
  await page.getByRole('link', { name: 'Editar principal' }).click();
  await page.waitForLoadState('networkidle');
  // Rótulo e Link do item lado a lado.
  const label = page.getByLabel('Rótulo').first();
  const href = page.getByLabel('Link').first();
  expect((await label.boundingBox())?.y).toBe((await href.boundingBox())?.y);
  const original = await label.inputValue();
  await label.fill(`${original} sem salvar`);
  await page.getByRole('link', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(/\/sites\/exemplo-a\/menus$/);
  await expect(page.getByRole('row', { name: /sem salvar/ })).toHaveCount(0);
});

test('editor edita um item do menu e o vê na lista', async ({ page }) => {
  const label = `Guias ${Date.now()}`;
  await asRole(page, 'editor');
  await page.goto('/sites/exemplo-a/menus');
  await page.getByRole('link', { name: 'Editar principal' }).click();

  const first = page.getByLabel('Rótulo').first();
  await first.fill(label);
  await expectNoViolations(page);
  await page.getByRole('button', { name: 'Salvar' }).click();

  await expect(page).toHaveURL(/\/sites\/exemplo-a\/menus$/);
  await expect(page.getByRole('row', { name: /principal/ })).toContainText(
    `${label} (/categoria/guias/)`,
  );
});

// Menus no padrão do template (#363): busca pela chave e paginação, com o estado na URL, e a
// coluna de itens numa linha cortada, com o texto inteiro em `title`.
test('menus: busca pela chave na URL, sem resultado na tabela e itens cortados', async ({
  page,
}) => {
  await asRole(page, 'editor');
  await page.goto('/sites/exemplo-a/menus');
  const table = page.getByRole('table', { name: 'Menus', exact: true });
  await expect(page.getByRole('navigation', { name: 'Paginação' })).toBeVisible();

  await page.getByLabel('Buscar por chave').fill('principal');
  await expect(page).toHaveURL(/q=principal/);
  await expect(table.locator('tbody tr')).toHaveCount(1);
  const items = table.getByRole('row', { name: /principal/ }).locator('td span.truncate');
  await expect(items).toHaveAttribute('title', /\(\/.*\)/);
  expect(await items.getAttribute('title')).toBe(await items.textContent());

  await page.reload();
  await expect(page.getByLabel('Buscar por chave')).toHaveValue('principal');
  await expect(table.locator('tbody tr')).toHaveCount(1);

  await page.goto('/sites/exemplo-a/menus?q=nenhuma-chave-assim');
  await expect(table.getByText('Nenhum menu encontrado.')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /resultados?$/ })).toHaveText(
    '0 resultados',
  );
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await expect(page.getByLabel('Buscar por chave')).toHaveValue('');
  await expect(table.getByRole('row', { name: /principal/ })).toBeVisible();
});

// Padrão do template (#363) e cabeçalho da tela de site no visual do Ecme (#247): trilha acima
// do cartão; título, ação, toolbar e tabela nele, nas três listas, nos dois temas.
test(`listas editoriais no cartão do template, sem violação do axe`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await asRole(page, 'editor');
  for (const [segment, title] of [
    ['autores', 'Autores'],
    ['taxonomias', 'Taxonomias'],
    ['menus', 'Menus'],
  ] as const) {
    await page.goto(`/sites/exemplo-a/${segment}`);
    const card = page.locator('.card').filter({ has: page.getByRole('table') });
    await expect(card).toHaveCount(1);
    await expect(card.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(card.getByRole('link', { name: /^Criar / })).toBeVisible();
    await expect(card.getByRole('search')).toBeVisible();
    await expect(card.getByRole('navigation', { name: 'Trilha de navegação' })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Trilha de navegação' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expectNoViolations(page);
  }
});

test('editor altera o texto "sobre" com rich text', async ({ page }) => {
  const text = `Quem somos, revisto em ${Date.now()}.`;
  // Sem a animação do toast, o axe audita a confirmação já em repouso.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await asRole(page, 'editor');
  await page.goto('/sites/exemplo-a');
  await page
    .getByRole('navigation', { name: 'Áreas do site' })
    .getByRole('link', { name: 'Textos institucionais' })
    .click();

  const about = page.getByRole('textbox', { name: 'Sobre' });
  await about.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(text);
  await expectNoViolations(page);
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Textos salvos.' })).toBeVisible();
  await expectNoViolations(page);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Sobre' })).toHaveText(text);
});

test('revisor não vê formulário nem links de criar e editar', async ({ page }) => {
  await asRole(page, 'revisor');
  await page.goto('/sites/exemplo-a');
  const nav = page.getByRole('navigation', { name: 'Áreas do site' });
  await expect(nav.getByRole('link', { name: 'Autores' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Textos institucionais' })).toHaveCount(0);

  for (const segment of ['autores', 'taxonomias', 'menus']) {
    await page.goto(`/sites/exemplo-a/${segment}`);
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('link', { name: /^(Criar|Editar)/ })).toHaveCount(0);
  }
  for (const path of ['autores/novo', 'taxonomias/1', 'menus/1', 'institucionais']) {
    await page.goto(`/sites/exemplo-a/${path}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Sem permissão' })).toBeVisible();
    await expect(page.getByText('Editar conteúdo exige o papel admin ou editor.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Criar|Salvar/ })).toHaveCount(0);
  }
});

// A lista legível de relance a 1280 px (30 autores, linhas por célula, sem rolagem horizontal),
// o tamanho da página na URL e o axe nos dois temas ficam em `EntityTable.browser.test.tsx` (#460).
