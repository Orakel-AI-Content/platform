import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Autores, taxonomias, menus e textos institucionais (#46) contra o ambiente local semeado:
// o editor cria e edita pelas telas e vê o resultado; o revisor não grava. Autores e
// taxonomias têm busca por nome e paginação (#108): o item novo, no fim da ordem por ID, é
// achado pela busca (o banco local acumula itens entre rodadas).

const WCAG = ['wcag2a', 'wcag2aa', 'wcag22aa'];

async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto('/sites');
  await page.getByRole('link', { name: email }).click();
  await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();
}

async function expectNoViolations(page: Page): Promise<void> {
  const accessibility = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(accessibility.violations).toEqual([]);
}

test('editor cria autor e categoria e os escolhe no editor de artigos', async ({ page }) => {
  const stamp = Date.now();
  const author = `Autora ${stamp}`;
  const category = `Categoria ${stamp}`;
  await loginAs(page, 'editor@orakel.local');
  await page.goto('/sites/exemplo-a');
  const nav = page.getByRole('navigation', { name: 'Áreas do site' });

  await nav.getByRole('link', { name: 'Autores' }).click();
  // A ação fica no cabeçalho e, com a lista vazia, também no estado vazio (#87).
  await page.getByRole('link', { name: 'Criar autor' }).first().click();
  // "Nome" exato: a lista também tem "Buscar por nome" (#108).
  await expect(page.getByRole('heading', { name: 'Criar autor' })).toBeVisible();
  await page.getByLabel('Nome', { exact: true }).fill(author);
  await page.getByLabel('Slug').fill(`autora-${stamp}`);
  await expectNoViolations(page);
  await page.getByRole('button', { name: 'Criar' }).click();
  await expect(page).toHaveURL(/\/sites\/exemplo-a\/autores$/);
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
  await page.getByLabel('Nome', { exact: true }).fill('Outra');
  await page.getByLabel('Slug').fill(`autora-${stamp}`);
  await page.getByRole('button', { name: 'Criar' }).click();
  await expect(page.getByLabel('Slug')).toHaveAttribute('aria-invalid', 'true');
  await expect(page).toHaveURL(/\/autores\/novo$/);

  await page.goto('/sites/exemplo-a/taxonomias');
  await page.getByRole('link', { name: 'Criar taxonomia' }).first().click();
  await expect(page.getByRole('heading', { name: 'Criar taxonomia' })).toBeVisible();
  await page.getByLabel('Tipo').selectOption({ label: 'Categoria' });
  await page.getByLabel('Nome', { exact: true }).fill(category);
  await page.getByLabel('Slug').fill(`categoria-${stamp}`);
  await page.getByRole('button', { name: 'Criar' }).click();
  await expect(page).toHaveURL(/\/sites\/exemplo-a\/taxonomias$/);
  await page.getByLabel('Buscar por nome').fill(category);
  await expect(page.getByRole('row', { name: new RegExp(category) })).toContainText('Categoria');

  // Busca sem resultado: a mensagem e "Limpar busca" volta a lista.
  await page.getByLabel('Buscar por nome').fill(`nada-${stamp}`);
  await expect(page.getByText('Nenhuma taxonomia encontrada.')).toBeVisible();
  await page.getByRole('button', { name: 'Limpar busca' }).click();
  await expect(page.getByLabel('Buscar por nome')).toHaveValue('');
  await expect(page.getByRole('table')).toBeVisible();

  await page.goto('/sites/exemplo-a/conteudos/novo');
  await page
    .getByRole('group', { name: 'Autores' })
    .getByRole('checkbox', { name: author })
    .check();
  await page
    .getByRole('group', { name: 'Taxonomias' })
    .getByRole('checkbox', { name: `${category} (categoria)` })
    .check();
});

// Cabeçalho da tela de site (trilha, título e ação) no visual do Ecme (#247), nos dois temas.
for (const colorScheme of ['light', 'dark'] as const) {
  test(`tela de site sem violação do axe (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await loginAs(page, 'editor@orakel.local');
    await page.goto('/sites/exemplo-a/autores');
    await expect(page.getByRole('heading', { level: 1, name: 'Autores' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Criar autor' }).first()).toBeVisible();
    await page.waitForLoadState('networkidle');

    await expectNoViolations(page);
  });
}

test('editor edita um item do menu e o vê na lista', async ({ page }) => {
  const label = `Guias ${Date.now()}`;
  await loginAs(page, 'editor@orakel.local');
  await page.goto('/sites/exemplo-a/menus');
  // Menus segue sem busca nem paginação (#108).
  await expect(page.getByRole('search')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Paginação' })).toHaveCount(0);
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

test('editor altera o texto "sobre" com rich text', async ({ page }) => {
  const text = `Quem somos, revisto em ${Date.now()}.`;
  await loginAs(page, 'editor@orakel.local');
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
  await page.getByRole('button', { name: 'Salvar textos' }).click();

  await expect(page.getByRole('main').getByRole('status')).toHaveText('Textos salvos.');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Sobre' })).toHaveText(text);
});

test('revisor não vê formulário nem links de criar e editar', async ({ page }) => {
  await loginAs(page, 'revisor@orakel.local');
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
