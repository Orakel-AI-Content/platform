import { expect, test, type Page } from '@playwright/test';

import { asRole } from './auth.ts';
import { addBlock } from './blocks.ts';
import { fieldLabel } from './fieldLabel.ts';
import { chooseOption } from './select.ts';

// Fluxos críticos da revisão (ADR 0019 da raiz): o editor cria um artigo, envia pela página do
// conteúdo e o encontra na fila; o revisor devolve com comentário. Aprovar e publicar ficam no
// fluxo de geração da pilha (`geracao.spec.ts`); a aparência, nos testes de componente.

/**
 * Fila filtrada pela busca (#365): a fila é paginada e vem da mais antiga para a mais recente,
 * e o banco local acumula envios de outras execuções; o slug está no título.
 */
const queueFor = (slug: string) => `/sites/exemplo-a/revisao?q=${slug}`;

/** Artigo mínimo em rascunho; devolve o caminho da página do conteúdo. */
async function createDraft(page: Page, title: string, slug: string): Promise<string> {
  await page.goto('/sites/exemplo-a/conteudos/novo');
  await page.getByLabel(fieldLabel('Título')).fill(title);
  await page.getByLabel('Slug').fill(slug);
  await chooseOption(page.getByRole('combobox', { name: fieldLabel('Autores') }), 'Ana Souza');
  await addBlock(page, 'Texto');
  await page.getByRole('textbox', { name: 'Texto', exact: true }).click();
  await page.keyboard.type('Parágrafo para revisão.');
  await page.getByRole('button', { name: 'Criar', exact: true }).click();
  // Depois de criar, o editor continua aberto no conteúdo criado (#109).
  await expect(page).toHaveURL(/\/sites\/exemplo-a\/conteudos\/\d+\/editar$/);
  const contentPath = new URL(page.url()).pathname.replace(/\/editar$/, '');
  await page.goto(contentPath);
  await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
  return contentPath;
}

test('editor envia pela página do conteúdo e o artigo aparece na fila do site', async ({
  page,
  browser,
}) => {
  const slug = `e2e-revisao-${Date.now()}`;
  const title = `Artigo ${slug}`;
  await asRole(page, 'editor');
  const contentPath = await createDraft(page, title, slug);

  // Revisor (sem content.write) vê a página do rascunho sem o botão.
  const reviewer = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
  await asRole(reviewer, 'revisor');
  await reviewer.goto(contentPath);
  await expect(reviewer.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
  await expect(reviewer.getByRole('button', { name: 'Enviar para revisão' })).toHaveCount(0);

  // Editor envia: o botão some e a versão fica em revisão.
  await page.getByRole('button', { name: 'Enviar para revisão' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Enviado para revisão.' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('table').getByRole('row').nth(1)).toContainText('Em revisão');
  await expect(page.getByRole('button', { name: 'Enviar para revisão' })).toHaveCount(0);

  // O artigo está na fila do site, para o editor e para o revisor.
  await page.goto(queueFor(slug));
  await expect(page.getByRole('link', { name: `${title} (revisar)` })).toHaveAttribute(
    'href',
    new RegExp(`/sites/exemplo-a/revisao/\\d+$`),
  );
  await reviewer.goto(queueFor(slug));
  await expect(reviewer.getByRole('row', { name: new RegExp(title) })).toBeVisible();
  await reviewer.context().close();
});

// Devolver ao editor (#598): o revisor devolve com um comentário, o artigo sai da fila e o
// comentário aparece para o editor no conteúdo e no editor, com "Enviar para revisão" de volta.
test('devolver ao editor com comentário; o editor vê o comentário e pode reenviar', async ({
  page,
  browser,
}) => {
  const slug = `e2e-devolver-${Date.now()}`;
  const title = `Artigo ${slug}`;
  const comment = 'Falta a fonte da tabela de plantio.';
  await asRole(page, 'editor');
  const contentPath = await createDraft(page, title, slug);
  await page.getByRole('button', { name: 'Enviar para revisão' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Enviado para revisão.' })).toBeVisible();

  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const reviewer = await context.newPage();
  await asRole(reviewer, 'revisor');
  await reviewer.goto(queueFor(slug));
  await reviewer.getByRole('link', { name: `${title} (revisar)` }).click();
  await expect(
    reviewer.getByRole('heading', { level: 1, name: `Revisão de “${title}”` }),
  ).toBeVisible();

  // Sem comentário, o erro fica no campo e nada é devolvido.
  const devolver = reviewer.getByRole('button', { name: 'Devolver ao editor' });
  await devolver.click();
  await expect(
    reviewer.getByText('Escreva o que o editor precisa corrigir.', { exact: true }),
  ).toBeVisible();
  await reviewer.getByRole('textbox', { name: /O que corrigir/ }).fill(comment);
  await devolver.click();
  await expect(
    reviewer.getByRole('status').filter({ hasText: 'Versão 1 devolvida ao editor.' }),
  ).toBeVisible();
  await expect(devolver).toHaveCount(0);
  await expect(reviewer.getByRole('button', { name: 'Aprovar' })).toHaveCount(0);

  await reviewer.goto(queueFor(slug));
  await expect(reviewer.getByRole('heading', { level: 1, name: /Revisão/ })).toBeVisible();
  await expect(reviewer.getByRole('row', { name: new RegExp(title) })).toHaveCount(0);
  await context.close();

  // O editor vê o comentário, quem devolveu e quando; a versão volta a rascunho.
  await page.goto(contentPath);
  await expect(page.getByText('Versão 1 devolvida ao editor')).toBeVisible();
  await expect(page.getByText(comment)).toBeVisible();
  await expect(
    page.getByText(/revisor@orakel\.local · \d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}/),
  ).toBeVisible();
  await expect(page.getByRole('table').getByRole('row').nth(1)).toContainText('Rascunho');
  await expect(page.getByRole('button', { name: 'Enviar para revisão' })).toBeVisible();

  await page.getByRole('link', { name: 'Editar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: `Editar “${title}”` })).toBeVisible();
  await expect(page.getByText(comment)).toBeVisible();
});
