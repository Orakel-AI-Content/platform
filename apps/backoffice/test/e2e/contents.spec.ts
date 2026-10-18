import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { readFixture } from '../../src/bin/seed.ts';
import { createDb, createPool } from '../../src/db/client.ts';
import { contents, contentVersions, media, mediaVariants } from '../../src/db/schema/index.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
import { createContent } from '../../src/domain/content/contents.ts';
import { createSite } from '../../src/domain/sites/sites.ts';
import { getEnv } from '../../src/env.ts';
import { removeSites } from './cleanup.ts';
import { analyzeTables } from './statistics.ts';

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
  // A barra de formatação do bloco de texto cabe numa linha a 1280 px (#133): a altura da
  // toolbar é a de um botão de ícone (32 px), sem segunda fileira.
  expect(page.viewportSize()?.width).toBe(1280);
  const toolbarBox = await page.getByRole('toolbar', { name: 'Formatação: Texto' }).boundingBox();
  expect(toolbarBox?.height).toBeLessThanOrEqual(40);
  await page.getByRole('textbox', { name: 'Texto', exact: true }).click();
  await page.keyboard.type('Primeiro parágrafo do artigo.');

  // Link pelo popover, só com teclado (#132): inválido não aplica, Enter aplica, Esc fecha, e
  // o foco volta ao editor.
  const textEditor = page.getByRole('textbox', { name: 'Texto', exact: true });
  const linkButton = page.getByRole('button', { name: 'Link', exact: true });
  const linkPopover = page.locator(`[id="${await linkButton.getAttribute('popovertarget')}"]`);
  const href = linkPopover.getByLabel('Endereço do link');
  // Sem seleção, com o cursor no fim do parágrafo: o endereço entra como link dentro da frase
  // (um link que fosse o parágrafo inteiro perderia a exceção de alvo em linha do axe).
  await page.keyboard.type(' Veja ');
  await linkButton.focus();
  await page.keyboard.press('Enter');
  await expect(href).toBeFocused();
  await page.keyboard.type('javascript:alert(1)');
  await page.keyboard.press('Enter');
  await expect(href).toHaveAttribute('aria-invalid', 'true');
  await expect(href).toHaveAccessibleDescription(
    /Use um caminho iniciado por \/ ou uma URL http\(s\)/,
  );
  await expect(textEditor.locator('a')).toHaveCount(0);
  await href.fill('/guias/');
  await page.keyboard.press('Enter');
  await expect(linkPopover).toBeHidden();
  await expect(textEditor).toBeFocused();
  await expect(textEditor.locator('a')).toHaveAttribute('href', '/guias/');
  await expect(textEditor).toContainText('Primeiro parágrafo do artigo. Veja /guias/');
  // Cursor dentro do link (não na borda do fim): o campo abre com o endereço atual.
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(linkButton).toHaveAttribute('aria-pressed', 'true');
  await linkButton.focus();
  await page.keyboard.press('Enter');
  await expect(href).toHaveValue('/guias/');
  await page.keyboard.press('Escape');
  await expect(linkPopover).toBeHidden();
  await expect(textEditor).toBeFocused();

  // A imagem do bloco pela grade de miniaturas (#182), só com o teclado.
  await addBlock(page, 'Imagem');
  const imageField = page.getByRole('group', { name: 'Mídia', exact: true });
  await imageField.getByRole('button', { name: 'Escolher imagem' }).focus();
  await page.keyboard.press('Enter');
  const grid = page.getByRole('dialog', { name: 'Escolher imagem' });
  await expect(grid.getByRole('list', { name: 'Imagens da biblioteca' })).toBeVisible();
  const firstImage = grid.getByRole('button', { name: /^Mídia \d+ · \d+×\d+$/ }).first();
  const chosen = (await firstImage.textContent()) ?? '';
  for (let step = 0; step < 5; step += 1) {
    if (await firstImage.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expect(firstImage).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(grid).toBeHidden();
  await expect(imageField.getByText(chosen, { exact: true }).first()).toBeVisible();
  await expect(imageField.getByRole('button', { name: 'Trocar' })).toBeFocused();

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

  // Controles de bloco são botões de ícone com alvo de pelo menos 24×24 px (#131).
  for (const name of ['Mover bloco 2 para cima', 'Mover bloco 2 para baixo', 'Remover bloco 2']) {
    const box = await page.getByRole('button', { name }).boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(24);
    expect(box?.height).toBeGreaterThanOrEqual(24);
  }
  await expect(page.getByRole('button', { name: 'Mover bloco 1 para cima' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );

  // Reordenar e remover pelo teclado: a FAQ sobe e volta, nada se perde.
  await page.getByRole('button', { name: 'Mover bloco 3 para cima' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('group', { name: 'Bloco 2: FAQ' })).toBeVisible();
  await page.getByRole('button', { name: 'Mover bloco 2 para baixo' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('group', { name: 'Bloco 3: FAQ' })).toBeVisible();

  // A mensagem do FormItem (#245) volta a entrar, com transição de opacidade, quando o bloco é
  // remontado na troca de posição; o axe roda depois dela.
  await expect(page.locator('.form-explain')).toHaveCSS('opacity', '1');
  // O ponteiro ficou sobre "Criar conteúdo" desde o clique; o axe audita o rodapé em repouso.
  await page.mouse.move(0, 0);
  const accessibility = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(accessibility.violations).toEqual([]);

  await alt.fill('Mesa organizada');
  await page.getByRole('button', { name: 'Criar conteúdo' }).click();

  // Fica no editor do conteúdo criado, com a confirmação na barra (#109).
  await expect(page).toHaveURL(/\/sites\/exemplo-a\/conteudos\/\d+\/editar$/);
  await expect(page.getByRole('heading', { name: `Editar “${title}”` })).toBeVisible();
  await expect(page.getByRole('main').getByRole('status')).toHaveText('Conteúdo criado.');

  await page.goto('/sites/exemplo-a/conteudos');
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
      await analyzeTables(db, contents, contentVersions);
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
    // A contagem fica ao lado do nav "Paginação" do Ecme, não dentro dele (#269).
    const count = page.getByRole('status').filter({ hasText: /resultados?$/ });

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
    // O filtro é o combobox do react-select (#269): abre com a seta e escolhe pelo nome.
    await page.getByRole('combobox', { name: 'Tipo' }).focus();
    await page.keyboard.press('ArrowDown');
    await page.getByRole('option', { name: 'Página', exact: true }).click();
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
    await page.getByRole('button', { name: 'Próxima página' }).click();
    await expect(page.getByText('Página 2 de 20')).toBeVisible();
    await expect(page).toHaveURL(/tipo=page/);
    await expect(page).toHaveURL(/ordem=title/);
    await expect(page).toHaveURL(/pagina=2/);
    const firstRow = await page.getByRole('row').nth(1).textContent();

    const other = await context.newPage();
    await other.goto(page.url());
    await expect(other.getByRole('status').filter({ hasText: /resultados?$/ })).toHaveText(
      '500 resultados',
    );
    await expect(other.getByText('Página 2 de 20')).toBeVisible();
    await expect(other.getByRole('search').getByText('Página', { exact: true })).toBeVisible();
    await expect(
      other
        .getByRole('navigation', { name: 'Paginação' })
        .getByRole('button', { name: 'Página 2', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
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

test.describe('barra de ações do editor (#109)', () => {
  let contentId = 0;
  const title = `Artigo longo ${Date.now()}`;

  test.beforeAll(async () => {
    const fixture = await readFixture('exemplo-a');
    const content = fixture.find((line) => line.type === 'content');
    if (content?.type !== 'content') throw new Error('fixture sem conteúdo');
    const pool = createPool(getEnv().DATABASE_URL);
    try {
      const created = await createDb(pool).transaction((tx) =>
        createContent(tx, SYSTEM_ACTOR, 'exemplo-a', {
          // O ID da fixture é ignorado: o domínio aloca o próximo.
          ...content.data,
          kind: 'article',
          title,
          slug: `artigo-longo-${Date.now()}`,
          // 20 blocos: o fim do formulário fica bem abaixo da dobra.
          blocks: Array.from({ length: 20 }, (_, index) => ({
            new: true as const,
            type: 'toc' as const,
            title: `Seção ${index + 1}`,
          })),
        }),
      );
      if (!created.ok) throw new Error(JSON.stringify(created.issues));
      contentId = created.value.id;
    } finally {
      await pool.end();
    }
  });

  test('salvar fica visível em qualquer ponto da rolagem e mantém a pessoa no editor', async ({
    page,
  }) => {
    await loginAs(page, 'editor@orakel.local');
    const editPath = `/sites/exemplo-a/conteudos/${contentId}/editar`;
    await page.goto(editPath);
    const save = page.getByRole('button', { name: 'Salvar nova versão' });

    for (const position of [0, 0.5, 1]) {
      await page.evaluate((fraction) => {
        window.scrollTo(0, (document.body.scrollHeight - window.innerHeight) * fraction);
      }, position);
      await expect(save).toBeInViewport();
    }
    const status = page.getByRole('main').getByRole('status');

    await save.click();
    await expect(status).toHaveText('Versão 2 salva.');
    await expect(page).toHaveURL(new RegExp(`${editPath}$`));
    await expect(page.getByText('Partindo da versão 2;')).toBeVisible();

    // Salvar de novo sem mudar nada: nova versão, os mesmos 20 blocos.
    await save.click();
    await expect(status).toHaveText('Versão 3 salva.');
    await expect(page.getByRole('group', { name: /^Bloco \d+:/ })).toHaveCount(20);
    await expect(page.getByRole('main').getByRole('alert')).toHaveText('');
  });

  test('com alterações não salvas, sair pede confirmação; depois de salvar, não (#111)', async ({
    page,
  }) => {
    await loginAs(page, 'editor@orakel.local');
    const editPath = `/sites/exemplo-a/conteudos/${contentId}/editar`;
    await page.goto(editPath);
    const titleField = page.getByLabel('Título', { exact: true });
    // O conteúdo na trilha (#174) leva às versões; pelo destino, porque o título muda ao salvar.
    const versions = page
      .getByRole('navigation', { name: 'Trilha de navegação' })
      .locator(`a[href$="/conteudos/${contentId}"]`);
    const dialogs: string[] = [];

    // Link interno com alteração: cancelar fica no editor com o texto digitado.
    await titleField.fill(`${title} (rascunho)`);
    page.once('dialog', (dialog) => {
      dialogs.push(dialog.type());
      void dialog.dismiss();
    });
    await versions.click();
    await expect(page).toHaveURL(new RegExp(`${editPath}$`));
    await expect(titleField).toHaveValue(`${title} (rascunho)`);

    // Depois de salvar, nenhuma pergunta: o link navega direto.
    await page.getByRole('button', { name: 'Salvar nova versão' }).click();
    await expect(page.getByRole('main').getByRole('status')).toHaveText(/Versão \d+ salva\./);
    page.on('dialog', (dialog) => {
      dialogs.push(`inesperado: ${dialog.type()}`);
      void dialog.dismiss();
    });
    await versions.click();
    await expect(page).toHaveURL(new RegExp(`/conteudos/${contentId}$`));
    page.removeAllListeners('dialog');

    // Confirmar navega; fechar a aba com alteração dispara o beforeunload.
    await page.goto(editPath);
    await titleField.fill(`${title} (de novo)`);
    page.once('dialog', (dialog) => {
      dialogs.push(dialog.type());
      void dialog.accept();
    });
    await versions.click();
    await expect(page).toHaveURL(new RegExp(`/conteudos/${contentId}$`));

    await page.goto(editPath);
    await titleField.fill(`${title} (fechar)`);
    page.once('dialog', (dialog) => {
      dialogs.push(dialog.type());
      void dialog.dismiss();
    });
    await page.close({ runBeforeUnload: true });
    await expect.poll(() => dialogs).toEqual(['confirm', 'confirm', 'beforeunload']);
  });

  test('insere um bloco no meio só pelo teclado; Esc fecha a lista e devolve o foco (#134)', async ({
    page,
  }) => {
    await loginAs(page, 'editor@orakel.local');
    await page.goto(`/sites/exemplo-a/conteudos/${contentId}/editar`);
    const trigger = page.getByRole('button', { name: 'Inserir bloco na posição 2', exact: true });
    const list = page.locator(`[id="${await trigger.getAttribute('popovertarget')}"]`);

    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(list).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(list).toBeHidden();
    await expect(trigger).toBeFocused();

    // Abre de novo e chega ao "Sumário" pelo Tab (a lista vem logo depois do gatilho).
    await page.keyboard.press('Enter');
    const toc = list.getByRole('button', { name: 'Sumário' });
    for (let step = 0; step < 6; step += 1) {
      await page.keyboard.press('Tab');
      if (await toc.evaluate((node) => node === document.activeElement)) break;
    }
    await expect(toc).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(list).toBeHidden();
    const inserted = page.getByRole('group', { name: 'Bloco 2: Sumário', exact: true });
    await expect(inserted.getByLabel('Título do sumário')).toBeFocused();
    await expect(inserted.getByLabel('Título do sumário')).toHaveValue('');
    await expect(page.getByRole('group', { name: /^Bloco \d+:/ })).toHaveCount(21);
    await expect(page.getByRole('button', { name: 'Remover bloco 21', exact: true })).toBeVisible();
  });

  test('recolhe e expande blocos só pelo teclado; recolhido, o bloco ocupa uma linha (#135)', async ({
    page,
  }) => {
    await loginAs(page, 'editor@orakel.local');
    await page.goto(`/sites/exemplo-a/conteudos/${contentId}/editar`);
    const toggle = page.getByRole('button', { name: 'Conteúdo do bloco 1', exact: true });
    const group = page.getByRole('group', { name: 'Bloco 1: Sumário', exact: true });

    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
    await expect(group.getByText('Seção 1', { exact: true })).toHaveAttribute('title', 'Seção 1');
    await expect(group.getByLabel('Título do sumário')).toBeHidden();
    // Uma linha: a altura do bloco é a do cabeçalho (botões de 32 px) mais o espaçamento.
    const box = await group.boundingBox();
    expect(box?.height).toBeLessThanOrEqual(72);

    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(group.getByLabel('Título do sumário')).toHaveValue('Seção 1');

    const expanded = page.locator('button[aria-expanded][aria-label^="Conteúdo do bloco"]');
    await page.getByRole('button', { name: 'Recolher todos' }).focus();
    await page.keyboard.press('Enter');
    await expect(
      page.locator('button[aria-label^="Conteúdo do bloco"][aria-expanded="false"]'),
    ).toHaveCount(20);
    await page.getByRole('button', { name: 'Expandir todos' }).focus();
    await page.keyboard.press('Enter');
    await expect(
      page.locator('button[aria-label^="Conteúdo do bloco"][aria-expanded="true"]'),
    ).toHaveCount(20);
    await expect(expanded).toHaveCount(20);
  });
});

const MEDIA_SITE = `e2e-midia-grade-${Date.now()}`;
const MEDIA_COUNT = 2000;

test.describe('grade de imagens com 2.000 mídias (#182)', () => {
  test.beforeAll(async () => {
    const config = (await readFixture('exemplo-b')).find((line) => line.type === 'config');
    if (config?.type !== 'config') throw new Error('fixture sem config');
    const pool = createPool(getEnv().DATABASE_URL);
    try {
      const db = createDb(pool);
      const site = await db.transaction((tx) =>
        createSite(tx, SYSTEM_ACTOR, {
          ...config.data,
          siteId: MEDIA_SITE,
          name: `Site ${MEDIA_SITE}`,
          domains: [`${MEDIA_SITE}.example.com`],
        }),
      );
      if (!site.ok) throw new Error(JSON.stringify(site.issues));
      const ids = Array.from({ length: MEDIA_COUNT }, (_, index) => index + 1);
      await db.transaction(async (tx) => {
        await tx
          .insert(media)
          .values(ids.map((id) => ({ siteId: MEDIA_SITE, id, width: 800, height: 600 })));
        await tx.insert(mediaVariants).values(
          ids.map((id) => ({
            siteId: MEDIA_SITE,
            mediaId: id,
            width: 400,
            format: 'webp',
            path: `/media/${id}-400.webp`,
          })),
        );
      });
      await analyzeTables(db, media, mediaVariants);
    } finally {
      await pool.end();
    }
  });

  test.afterAll(async () => {
    await removeSites([MEDIA_SITE]);
  });

  test('a grade abre com a primeira página em menos de 2 s', async ({ page }) => {
    await loginAs(page, 'editor@orakel.local');
    await page.goto(`/sites/${MEDIA_SITE}/conteudos/novo`);
    await addBlock(page, 'Imagem');
    const grid = page.getByRole('dialog', { name: 'Escolher imagem' });

    const started = Date.now();
    await page
      .getByRole('group', { name: 'Mídia', exact: true })
      .getByRole('button', { name: 'Escolher imagem' })
      .click();
    await expect(grid.getByRole('status')).toHaveText(`Página 1 de 84 · ${MEDIA_COUNT} imagens`);
    expect(Date.now() - started).toBeLessThan(2000);
    await expect(grid.getByRole('button', { name: /^Mídia \d+ · 800×600$/ })).toHaveCount(24);
  });
});
