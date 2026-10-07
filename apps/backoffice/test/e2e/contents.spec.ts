import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { readFixture } from '../../src/bin/seed.ts';
import { createDb, createPool } from '../../src/db/client.ts';
import { contents, contentVersions } from '../../src/db/schema/index.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
import { createSite } from '../../src/domain/sites/sites.ts';
import { getEnv } from '../../src/env.ts';
import { removeSites } from './cleanup.ts';

// Editor de conteúdo (#45) contra o ambiente local semeado: o editor cria um artigo com
// texto, imagem e FAQ e o acha na lista; o revisor não grava nada. Lista com 2.000
// conteúdos (#107): num site próprio, gravado direto no banco e removido no fim.

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

const BIG_SITE = `e2e-conteudos-${Date.now()}`;
const BIG_COUNT = 2000;
/** Abrir a lista e atualizar a busca ou o filtro: teto da #35 (CA1). */
const MAX_MS = 2000;

test.describe('lista com 2.000 conteúdos (#107)', () => {
  test.beforeAll(async () => {
    const fixture = await readFixture('exemplo-b');
    const config = fixture.find((line) => line.type === 'config');
    const content = fixture.find((line) => line.type === 'content');
    if (config?.type !== 'config' || content?.type !== 'content') {
      throw new Error('fixture sem config ou conteúdo');
    }
    // Sem o ID do conteúdo da fixture (o JSONB não guarda o ID; undefined some no JSON).
    const template = { ...content.data, id: undefined };
    const pool = createPool(getEnv().DATABASE_URL);
    try {
      const db = createDb(pool);
      const site = await db.transaction((tx) =>
        createSite(tx, SYSTEM_ACTOR, {
          ...config.data,
          siteId: BIG_SITE,
          name: `Site ${BIG_SITE}`,
          domains: [`${BIG_SITE}.example.com`],
        }),
      );
      if (!site.ok) throw new Error(JSON.stringify(site.issues));
      // A cada 100, "Promoção": a busca sem acento acha 20. Um em quatro é página.
      const ids = Array.from({ length: BIG_COUNT }, (_, index) => index + 1);
      const kind = (id: number) => (id % 4 === 0 ? ('page' as const) : ('article' as const));
      const title = (id: number) => (id % 100 === 0 ? `Promoção ${id}` : `Receita ${id}`);
      await db.transaction(async (tx) => {
        await tx
          .insert(contents)
          .values(ids.map((id) => ({ siteId: BIG_SITE, id, kind: kind(id), nextBlockN: 1 })));
        await tx.insert(contentVersions).values(
          ids.map((id) => ({
            siteId: BIG_SITE,
            contentId: id,
            version: 1,
            status: id % 2 === 0 ? ('publicado' as const) : ('rascunho' as const),
            data: {
              ...template,
              kind: kind(id),
              title: title(id),
              slug: `conteudo-${id}`,
              authorIds: [],
              taxonomyIds: [],
              blocks: [],
            },
          })),
        );
      });
    } finally {
      await pool.end();
    }
  });

  test.afterAll(async () => {
    await removeSites([BIG_SITE]);
  });

  test('abre, busca e filtra em menos de 2 s, e a URL leva o estado para outra aba', async ({
    page,
    context,
  }) => {
    await loginAs(page, 'editor@orakel.local');
    const count = page.getByRole('navigation', { name: 'Paginação' }).getByRole('status');

    let started = Date.now();
    await page.goto(`/sites/${BIG_SITE}/conteudos`);
    await expect(count).toHaveText('2.000 resultados');
    expect(Date.now() - started).toBeLessThan(MAX_MS);
    await expect(page.getByRole('row')).toHaveCount(26);
    await expect(page.getByRole('columnheader', { name: /Última alteração/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    );

    started = Date.now();
    await page.getByLabel('Buscar por título').fill('promocao');
    await expect(count).toHaveText('20 resultados');
    expect(Date.now() - started).toBeLessThan(MAX_MS);

    started = Date.now();
    await page.getByLabel('Tipo').selectOption({ label: 'Página' });
    await expect(page).toHaveURL(/tipo=page/);
    // Os 20 "Promoção" (múltiplos de 100) são todos páginas: a busca e o filtro combinam.
    await expect(count).toHaveText('20 resultados');
    await page.getByLabel('Buscar por título').fill('');
    await expect(count).toHaveText('500 resultados');
    expect(Date.now() - started).toBeLessThan(MAX_MS);

    await page
      .getByRole('columnheader', { name: /Título/ })
      .getByRole('button')
      .click();
    await page.getByRole('button', { name: 'Próxima' }).click();
    await expect(page.getByText('Página 2 de 20')).toBeVisible();
    await expect(page).toHaveURL(/tipo=page/);
    await expect(page).toHaveURL(/ordem=title/);
    await expect(page).toHaveURL(/pagina=2/);
    const firstRow = await page.getByRole('row').nth(1).textContent();

    const other = await context.newPage();
    await other.goto(page.url());
    await expect(
      other.getByRole('navigation', { name: 'Paginação' }).getByRole('status'),
    ).toHaveText('500 resultados');
    await expect(other.getByText('Página 2 de 20')).toBeVisible();
    await expect(other.getByLabel('Tipo')).toHaveValue('page');
    await expect(other.getByRole('columnheader', { name: /Título/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    await expect(other.getByRole('row').nth(1)).toHaveText(firstRow ?? '');

    const accessibility = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(accessibility.violations).toEqual([]);
  });

  test('busca sem resultado mostra a mensagem, e "Limpar busca" volta a lista', async ({
    page,
  }) => {
    await loginAs(page, 'editor@orakel.local');
    await page.goto(`/sites/${BIG_SITE}/conteudos?q=nada-com-isso`);

    await expect(page.getByText('Nenhum conteúdo encontrado.')).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
    await page.getByRole('button', { name: 'Limpar busca' }).click();

    await expect(page.getByLabel('Buscar por título')).toHaveValue('');
    await expect(page.getByRole('row')).toHaveCount(26);
  });
});
