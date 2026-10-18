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
  // Depois de criar, o editor continua aberto no conteúdo criado (#109).
  await expect(page).toHaveURL(/\/sites\/exemplo-a\/conteudos\/\d+\/editar$/);
  // As versões, pela trilha (#174): o título do conteúdo leva a elas.
  await page
    .getByRole('navigation', { name: 'Trilha de navegação' })
    .getByRole('link', { name: title })
    .click();
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

  // A fila é acessível pela barra lateral do site e mostra título, tipo, versão e data.
  await page.goto('/sites/exemplo-a');
  await page
    .getByRole('navigation', { name: 'Áreas do site' })
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
    .getByRole('navigation', { name: 'Áreas do site' })
    .getByRole('link', { name: 'Revisão' })
    .click();
  await expect(reviewer.getByRole('row', { name: new RegExp(title) })).toBeVisible();
});

// Fila na Table do Ecme (#276): a 1280 px nada rola na horizontal, nenhuma célula passa de
// duas linhas de texto e o axe não acha violação, nos dois temas.
for (const colorScheme of ['light', 'dark'] as const) {
  test(`fila a 1280 px, até duas linhas por célula, sem violação do axe (${colorScheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    const slug = `e2e-fila-${colorScheme}-${Date.now()}`;
    const title = `Artigo ${slug}`;
    await loginAs(page, 'editor@orakel.local');
    await createDraft(page, title, slug);
    await page.getByRole('button', { name: 'Enviar para revisão' }).click();
    await expect(page.getByRole('main').getByRole('status')).toHaveText('Enviado para revisão.');

    await page.goto('/sites/exemplo-a/revisao');
    expect(page.viewportSize()?.width).toBe(1280);
    const table = page.getByRole('table');
    await expect(table.getByRole('row', { name: new RegExp(title) })).toBeVisible();

    const overflow = await table.evaluate((element) => [
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
      element.parentElement!.scrollWidth - element.parentElement!.clientWidth,
    ]);
    expect(overflow).toEqual([0, 0]);

    // Linhas de texto por célula (mesma medida de `sites-list.spec.ts`): retângulos de texto
    // visíveis que se sobrepõem na vertical são a mesma linha; o sr-only fica de fora.
    const lines = await table.locator('tbody td').evaluateAll((cells) =>
      cells.map((cell) => {
        const found: { top: number; bottom: number }[] = [];
        const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
          if (!node.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const rect of range.getClientRects()) {
            if (rect.width <= 1 || rect.height <= 1) continue;
            const middle = (rect.top + rect.bottom) / 2;
            const line = found.find((l) => l.top <= middle && middle <= l.bottom);
            if (line === undefined) found.push({ top: rect.top, bottom: rect.bottom });
            else
              Object.assign(line, {
                top: Math.min(line.top, rect.top),
                bottom: Math.max(line.bottom, rect.bottom),
              });
          }
        }
        return found.length;
      }),
    );
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.filter((count) => count > 2)).toEqual([]);

    const accessibility = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(accessibility.violations).toEqual([]);
  });
}

// Tela de revisão (#75): a visualização fica em preview.*, com sessão própria no Access.
const PREVIEW = 'https://preview.orakel.localhost';

async function loginPreview(page: Page, email: string): Promise<void> {
  await page.goto(`${PREVIEW}/exemplo-a/`);
  await page.getByRole('link', { name: email }).click();
}

test('enviar, achar na fila e aprovar com o checklist; o artigo sai da fila', async ({
  page,
  browser,
}) => {
  const slug = `e2e-aprovar-${Date.now()}`;
  const title = `Artigo ${slug}`;
  await loginAs(page, 'editor@orakel.local');
  await createDraft(page, title, slug);
  await page.getByRole('button', { name: 'Enviar para revisão' }).click();
  await expect(page.getByRole('main').getByRole('status')).toHaveText('Enviado para revisão.');

  // Editor abre a revisão: vê a visualização e o checklist, sem a ação de aprovar.
  await page.goto('/sites/exemplo-a/revisao');
  await page.getByRole('link', { name: `${title} (revisar)` }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: `Revisão de “${title}”` }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aprovar' })).toHaveCount(0);

  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const reviewer = await context.newPage();
  await loginAs(reviewer, 'revisor@orakel.local');
  await loginPreview(reviewer, 'revisor@orakel.local');
  await reviewer.goto('/sites/exemplo-a/revisao');
  await reviewer.getByRole('link', { name: `${title} (revisar)` }).click();

  // A visualização do site, no iframe, com o artigo em revisão.
  const frame = reviewer.locator('iframe');
  await expect(frame).toHaveAttribute('src', `${PREVIEW}/exemplo-a/${slug}/`);
  await expect(frame).toHaveAttribute('title', `Visualização de “${title}” no site`);
  await expect(
    reviewer.frameLocator('iframe').getByRole('heading', { level: 1, name: title }),
  ).toBeVisible();
  await expect(reviewer.getByText('Nenhum problema de validação.')).toBeVisible();

  const accessibility = await new AxeBuilder({ page: reviewer })
    .withTags(WCAG)
    .exclude('iframe')
    .analyze();
  expect(accessibility.violations).toEqual([]);

  // Os 5 itens do checklist (REVIEW_CHECKLIST), marcados pelo teclado.
  const items = reviewer.getByRole('checkbox');
  await expect(items).toHaveCount(5);
  for (let index = 0; index < 5; index += 1) {
    await items.nth(index).focus();
    await reviewer.keyboard.press('Space');
  }
  await reviewer.getByRole('button', { name: 'Aprovar' }).click();
  // A tela tem dois status (o do formulário do checklist e o do painel): o do resultado.
  await expect(
    reviewer.getByRole('main').getByRole('status').filter({ hasText: 'Versão 1 aprovada.' }),
  ).toBeVisible();
  await expect(reviewer.getByRole('button', { name: 'Aprovar' })).toHaveCount(0);

  await reviewer.goto('/sites/exemplo-a/revisao');
  await expect(reviewer.getByRole('heading', { level: 1, name: /Revisão/ })).toBeVisible();
  await expect(reviewer.getByRole('row', { name: new RegExp(title) })).toHaveCount(0);
  await context.close();
});
