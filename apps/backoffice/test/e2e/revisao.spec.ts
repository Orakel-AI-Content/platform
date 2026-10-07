import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Fila de revisão (#74) contra o ambiente local semeado: o editor cria um artigo, envia pela
// página do conteúdo e o encontra na fila; o revisor vê a fila mas não o botão de enviar.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag22aa'];

async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto('/sites');
  await page.getByRole('link', { name: email }).click();
  await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();
}

/** Artigo mínimo em rascunho; devolve o caminho da página do conteúdo. */
async function createDraft(page: Page, title: string, slug: string): Promise<string> {
  await page.goto('/sites/exemplo-a/conteudos/novo');
  await page.getByLabel('Título', { exact: true }).fill(title);
  await page.getByLabel('Slug').fill(slug);
  await page
    .getByRole('group', { name: 'Autores' })
    .getByRole('checkbox', { name: 'Ana Souza' })
    .check();
  await page.getByLabel('Tipo do novo bloco').selectOption({ label: 'Texto' });
  await page.getByRole('button', { name: 'Adicionar bloco' }).click();
  await page.getByRole('textbox', { name: 'Texto', exact: true }).click();
  await page.keyboard.type('Parágrafo para revisão.');
  await page.getByRole('button', { name: 'Criar conteúdo' }).click();
  await expect(page).toHaveURL(/\/sites\/exemplo-a\/conteudos$/);
  await page.getByRole('link', { name: `${title} (versões)` }).click();
  await expect(page.getByRole('heading', { name: `Versões de “${title}”` })).toBeVisible();
  return new URL(page.url()).pathname;
}

test('editor envia pela página do conteúdo e o artigo aparece na fila do site', async ({
  page,
  browser,
}) => {
  const slug = `e2e-revisao-${Date.now()}`;
  const title = `Artigo ${slug}`;
  await loginAs(page, 'editor@orakel.local');
  const contentPath = await createDraft(page, title, slug);

  // Revisor (sem content.write) vê a página do rascunho sem o botão.
  const reviewer = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
  await loginAs(reviewer, 'revisor@orakel.local');
  await reviewer.goto(contentPath);
  await expect(reviewer.getByRole('heading', { name: `Versões de “${title}”` })).toBeVisible();
  await expect(reviewer.getByRole('button', { name: 'Enviar para revisão' })).toHaveCount(0);

  // Editor envia: o retorno aparece em role=status e o botão some (versão em revisão).
  await page.getByRole('button', { name: 'Enviar para revisão' }).click();
  // O status global (indicador de navegação) também é role=status: só o do conteúdo.
  await expect(page.getByRole('main').getByRole('status')).toHaveText('Enviado para revisão.');
  await expect(page.getByRole('button', { name: 'Enviar para revisão' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('table').getByRole('row').nth(1)).toContainText('Em revisão');
  await expect(page.getByRole('button', { name: 'Enviar para revisão' })).toHaveCount(0);

  // A fila é acessível pela navegação do site e mostra título, tipo, versão e data.
  await page.goto('/sites/exemplo-a');
  await page
    .getByRole('navigation', { name: 'Conteúdo editorial do site' })
    .getByRole('link', { name: 'Revisão' })
    .click();
  await expect(page).toHaveURL(/\/sites\/exemplo-a\/revisao$/);
  await expect(page.getByRole('heading', { level: 1, name: /Revisão/ })).toBeVisible();
  const row = page.getByRole('row', { name: new RegExp(title) });
  await expect(row).toContainText('Artigo');
  await expect(row.getByRole('cell').nth(2)).toHaveText('1');
  await expect(row.getByRole('cell').nth(3)).toHaveText(/\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}/);
  await expect(row.getByRole('link', { name: `${title} (revisar)` })).toHaveAttribute(
    'href',
    new RegExp(`/sites/exemplo-a/revisao/\\d+$`),
  );

  const accessibility = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(accessibility.violations).toEqual([]);

  // O revisor também alcança a fila pela navegação.
  await reviewer.goto('/sites/exemplo-a');
  await reviewer
    .getByRole('navigation', { name: 'Conteúdo editorial do site' })
    .getByRole('link', { name: 'Revisão' })
    .click();
  await expect(reviewer.getByRole('row', { name: new RegExp(title) })).toBeVisible();
});
