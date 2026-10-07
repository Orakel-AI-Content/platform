import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Editor de conteúdo (#45) contra o ambiente local semeado: o editor cria um artigo com
// texto, imagem e FAQ e o acha na lista; o revisor não grava nada.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag22aa'];

async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto('/sites');
  await page.getByRole('link', { name: email }).click();
  await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();
}

async function addBlock(page: Page, type: string): Promise<void> {
  await page.getByLabel('Tipo do novo bloco').selectOption({ label: type });
  await page.getByRole('button', { name: 'Adicionar bloco' }).click();
}

test('editor cria um artigo com texto, imagem e FAQ e o encontra na lista', async ({ page }) => {
  const slug = `e2e-${Date.now()}`;
  const title = `Artigo ${slug}`;
  await loginAs(page, 'editor@orakel.local');
  await page.goto('/sites/exemplo-a/conteudos');
  // A ação fica no cabeçalho e, com a lista vazia, também no estado vazio (#87).
  await page.getByRole('link', { name: 'Criar conteúdo' }).first().click();
  await expect(page.getByRole('heading', { name: 'Criar conteúdo' })).toBeVisible();

  await page.getByLabel('Título', { exact: true }).fill(title);
  await page.getByLabel('Slug').fill(slug);
  const authors = page.getByRole('group', { name: 'Autores' });
  await authors.getByRole('checkbox', { name: 'Ana Souza' }).check();
  await page
    .getByRole('group', { name: 'Taxonomias' })
    .getByRole('checkbox', { name: 'Guias (categoria)' })
    .check();

  await addBlock(page, 'Texto');
  await page.getByRole('textbox', { name: 'Texto', exact: true }).click();
  await page.keyboard.type('Primeiro parágrafo do artigo.');

  await addBlock(page, 'Imagem');
  await page.getByLabel('Mídia', { exact: true }).selectOption({ index: 1 });

  await addBlock(page, 'FAQ');
  await page.getByRole('button', { name: 'Adicionar pergunta' }).click();
  await page.getByLabel('Pergunta', { exact: true }).fill('Funciona offline?');
  await page.getByRole('textbox', { name: 'Resposta' }).click();
  await page.keyboard.type('Não, precisa de conexão.');

  // Sem texto alternativo nem decorativa: recusado com a mensagem junto do campo.
  await page.getByRole('button', { name: 'Criar conteúdo' }).click();
  const alt = page.getByRole('textbox', { name: 'Texto alternativo' });
  await expect(alt).toHaveAttribute('aria-invalid', 'true');
  await expect(alt).toHaveAccessibleDescription(
    'Informe o texto alternativo ou marque a imagem como decorativa',
  );
  await expect(page).toHaveURL(/\/conteudos\/novo$/);

  // Reordenar e remover pelo teclado: a FAQ sobe e volta, nada se perde.
  await page.getByRole('button', { name: 'Mover bloco 3 para cima' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('group', { name: 'Bloco 2: FAQ' })).toBeVisible();
  await page.getByRole('button', { name: 'Mover bloco 2 para baixo' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('group', { name: 'Bloco 3: FAQ' })).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(accessibility.violations).toEqual([]);

  await alt.fill('Mesa organizada');
  await page.getByRole('button', { name: 'Criar conteúdo' }).click();

  await expect(page).toHaveURL(/\/sites\/exemplo-a\/conteudos$/);
  const row = page.getByRole('row', { name: new RegExp(title) });
  await expect(row).toContainText('Artigo');
  await expect(row).toContainText('Rascunho');
});

test('revisor não tem editor nem link para criar ou editar', async ({ page }) => {
  await loginAs(page, 'revisor@orakel.local');
  await page.goto('/sites/exemplo-a/conteudos');
  await expect(page.getByRole('heading', { name: /Conteúdos/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Criar conteúdo' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^Editar/ })).toHaveCount(0);

  // Tela de permissão (#80): título, a ação com os papéis que a permitem e a volta ao site.
  for (const path of ['conteudos/1/editar', 'conteudos/novo']) {
    await page.goto(`/sites/exemplo-a/${path}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Sem permissão' })).toBeVisible();
    await expect(page.getByText('Editar conteúdo exige o papel admin ou editor.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Salvar/ })).toHaveCount(0);
  }
  await page.getByRole('link', { name: 'Ir para o site exemplo-a' }).click();
  await expect(page).toHaveURL(/\/sites\/exemplo-a$/);
});
