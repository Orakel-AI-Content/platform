import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { readFixture } from '../../src/bin/seed.ts';
import { createDb, createPool } from '../../src/db/client.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
import { createAuthor } from '../../src/domain/content/authors.ts';
import { createSite } from '../../src/domain/sites/sites.ts';
import { getEnv } from '../../src/env.ts';
import { removeSites } from './cleanup.ts';

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

// Resumo de validação do SchemaForm no Alert do Ecme (#325), nos dois temas.
for (const colorScheme of ['light', 'dark'] as const) {
  test(`resumo de validação no Alert, sem violação do axe (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await loginAs(page, 'editor@orakel.local');
    await page.goto('/sites/exemplo-a/autores/novo');
    await expect(page.getByRole('heading', { name: 'Criar autor' })).toBeVisible();
    await page.getByRole('button', { name: 'Criar' }).click();

    const summary = page.getByRole('alert').filter({ hasText: 'Corrija os campos destacados:' });
    await expect(summary.locator('.alert')).toBeVisible();
    await summary.getByRole('button', { name: /^Nome:/ }).click();
    await expect(page.getByLabel('Nome', { exact: true })).toBeFocused();
    await expectNoViolations(page);
  });
}

// Remover item de lista do SchemaForm confirma num diálogo (#327), nos dois temas: Esc não
// remove e devolve o foco; "Remover" tira o item. Nada é salvo.
for (const colorScheme of ['light', 'dark'] as const) {
  test(`remover item do menu confirma, sem violação do axe (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await loginAs(page, 'editor@orakel.local');
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
}

// Formulário do template (#328), nos dois temas: campos em Card, Nome e Slug lado a lado a
// partir de md, a barra fixa na largura do main com Descartar (criar) ou Voltar (editar).
for (const colorScheme of ['light', 'dark'] as const) {
  test(`formulário de autor no template, sem violação do axe (${colorScheme})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await loginAs(page, 'editor@orakel.local');
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
    const name = page.getByLabel('Nome', { exact: true });
    const slug = page.getByLabel('Slug');
    expect((await name.boundingBox())?.y).toBe((await slug.boundingBox())?.y);
    // A barra encosta nas bordas do main.
    const bar = page
      .locator('.sticky')
      .filter({ has: page.getByRole('button', { name: 'Criar' }) });
    const main = await page.locator('main').boundingBox();
    const barBox = await bar.boundingBox();
    expect(barBox?.x).toBe(main?.x);
    expect(barBox?.width).toBe(main?.width);
    await page.setViewportSize({ width: 767, height: 800 });
    // Uma coluna: cada campo na sua linha (o schema põe o Slug antes do Nome).
    expect((await name.boundingBox())!.y).toBeGreaterThan((await slug.boundingBox())!.y);
    await page.setViewportSize({ width: 1280, height: 800 });

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
}

test('editar menu: Voltar leva à lista sem salvar', async ({ page }) => {
  await loginAs(page, 'editor@orakel.local');
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

  await expect(page.getByRole('status').filter({ hasText: 'Textos salvos.' })).toBeVisible();
  await expectNoViolations(page);
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

// Lista editorial legível de relance na Table do Ecme (#282): com mais autores do que cabem
// numa página, a 1280 px, ao lado da barra lateral, nem a página nem a tabela rolam na
// horizontal e nenhuma célula passa de duas linhas de texto. Autores, taxonomias e menus
// usam o mesmo `EntityTable`: a de autores, com busca, paginação e a coluna de editar, é o
// caso mais largo. Site próprio da rodada, com os autores gravados pelo domínio (cadastrar 30
// pela tela só tornaria o teste lento), removido no fim.
test.describe('lista editorial a 1280 px', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  const siteId = `e2e-editorial-${Date.now()}`;
  /** Nome e área de atuação longos: o pior caso de largura fica na própria rodada. */
  const LONG_NAME = 'Maria Aparecida dos Santos Albuquerque de Vasconcelos Neto';
  const LONG_EXPERTISE =
    'Culinária regional brasileira, confeitaria artesanal e fermentação natural';
  const MAX_LINES_PER_CELL = 2;

  test.beforeAll(async () => {
    const line = (await readFixture('exemplo-b')).find((l) => l.type === 'config');
    if (line?.type !== 'config') throw new Error('fixture sem config');
    const pool = createPool(getEnv().DATABASE_URL);
    try {
      await createDb(pool).transaction(async (tx) => {
        const site = await createSite(tx, SYSTEM_ACTOR, {
          ...line.data,
          siteId,
          name: `Site ${siteId}`,
          domains: [`${siteId}.example.com`],
        });
        if (!site.ok) throw new Error(JSON.stringify(site.issues));
        for (let index = 1; index <= 30; index++) {
          const author = await createAuthor(tx, SYSTEM_ACTOR, siteId, {
            slug: `autor-${index}`,
            name: index === 1 ? LONG_NAME : `Autor ${String(index).padStart(2, '0')}`,
            expertise: index === 1 ? LONG_EXPERTISE : 'Receitas',
          });
          if (!author.ok) throw new Error(JSON.stringify(author.issues));
        }
      });
    } finally {
      await pool.end();
    }
  });

  test.afterAll(async () => {
    await removeSites([siteId]);
  });

  test('com 30 autores, página e tabela sem rolagem horizontal e células de até duas linhas', async ({
    page,
  }) => {
    await loginAs(page, 'editor@orakel.local');
    await page.goto(`/sites/${siteId}/autores`);
    const table = page.getByRole('table');
    const rows = table.locator('tbody tr');
    await expect(rows).toHaveCount(25);
    await expect(page.getByRole('navigation', { name: 'Paginação' })).toBeVisible();
    await expect(rows.first().getByRole('link', { name: `Editar ${LONG_NAME}` })).toBeVisible();

    // Nem a página nem o contêiner da tabela (`overflow-x-auto` da Table) rolam na horizontal.
    const viewport = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth);
    const container = await table.evaluate((element) => ({
      scrollWidth: element.parentElement!.scrollWidth,
      clientWidth: element.parentElement!.clientWidth,
    }));
    expect(container.scrollWidth).toBeLessThanOrEqual(container.clientWidth);

    // Linhas de texto por célula, como em `sites-list.spec.ts` (#117): só nós de texto visíveis
    // (o sr-only mede 1 px e fica de fora); retângulos que se sobrepõem na vertical são a
    // mesma linha.
    const cells = await rows.evaluateAll((trs) =>
      trs.flatMap((tr) =>
        Array.from(tr.querySelectorAll('td'), (cell, column) => {
          const lines: { top: number; bottom: number }[] = [];
          const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
            if (!node.textContent?.trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            for (const rect of range.getClientRects()) {
              if (rect.width <= 1 || rect.height <= 1) continue;
              const middle = (rect.top + rect.bottom) / 2;
              const line = lines.find((l) => l.top <= middle && middle <= l.bottom);
              if (line === undefined) lines.push({ top: rect.top, bottom: rect.bottom });
              else
                Object.assign(line, {
                  top: Math.min(line.top, rect.top),
                  bottom: Math.max(line.bottom, rect.bottom),
                });
            }
          }
          const author = tr.querySelector('td')?.textContent?.trim() ?? '';
          return { author, column, lines: lines.length };
        }),
      ),
    );
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.filter((cell) => cell.lines > MAX_LINES_PER_CELL)).toEqual([]);
  });

  // A lista na Table do Ecme, com busca, paginação e editar, nos dois temas.
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`lista de autores paginada sem violação do axe (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await loginAs(page, 'editor@orakel.local');
      await page.goto(`/sites/${siteId}/autores`);
      await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(25);
      await page.waitForLoadState('networkidle');

      await expectNoViolations(page);
    });
  }
});
