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
import { fieldLabel } from './fieldLabel.ts';
import { chooseOption } from './select.ts';

// Editor de conteúdo (#45) contra o ambiente local semeado: o editor cria um artigo com
// texto, imagem e FAQ e o acha na lista; o revisor não grava nada. Lista com 2.000
// conteúdos (#107): num site próprio, gravado direto no banco e removido no fim.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag22aa'];
/** Região dos toasts (#212): o retorno das ações vai para ela, fora do main (#326). */
const toastRegion = (page: Page) => page.locator('[data-toast-placement="top-end"]');

async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto('/sites');
  await page.getByRole('link', { name: email }).click();
  await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();
}

async function addBlock(page: Page, type: string): Promise<void> {
  await chooseOption(page.getByRole('combobox', { name: 'Tipo do novo bloco' }), type);
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

  await page.getByLabel(fieldLabel('Título')).fill(title);
  await page.getByLabel('Slug').fill(slug);
  await chooseOption(page.getByRole('combobox', { name: fieldLabel('Autores') }), 'Ana Souza');
  await chooseOption(
    page.getByRole('combobox', { name: fieldLabel('Taxonomias') }),
    'Guias (categoria)',
  );

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

  // "Remover link" fecha o popover e confirma num diálogo (#327): Esc mantém o link e devolve
  // o foco ao botão Link; "Remover" tira o link, o texto fica e o foco volta ao editor.
  const removeLinkDialog = page.getByRole('alertdialog', { name: 'Remover o link?' });
  await linkButton.focus();
  await page.keyboard.press('Enter');
  await linkPopover.getByRole('button', { name: 'Remover link' }).click();
  await expect(linkPopover).toBeHidden();
  await expect(removeLinkDialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(removeLinkDialog).toHaveCount(0);
  await expect(linkButton).toBeFocused();
  await expect(textEditor.locator('a')).toHaveAttribute('href', '/guias/');
  await page.keyboard.press('Enter');
  await linkPopover.getByRole('button', { name: 'Remover link' }).click();
  await removeLinkDialog.getByRole('button', { name: 'Remover' }).click();
  await expect(removeLinkDialog).toHaveCount(0);
  await expect(textEditor.locator('a')).toHaveCount(0);
  await expect(textEditor).toContainText('Primeiro parágrafo do artigo. Veja /guias/');
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
  await page.getByLabel(fieldLabel('Pergunta')).fill('Funciona offline?');
  await page.getByRole('textbox', { name: 'Resposta' }).click();
  await page.keyboard.type('Não, precisa de conexão.');
  // Remover pergunta confirma num diálogo (#327).
  await page.getByRole('button', { name: 'Adicionar pergunta' }).click();
  await expect(page.getByLabel(fieldLabel('Pergunta'))).toHaveCount(2);
  await page.getByRole('button', { name: 'Remover pergunta 2' }).click();
  await page
    .getByRole('alertdialog', { name: 'Remover pergunta 2?' })
    .getByRole('button', { name: 'Remover' })
    .click();
  await expect(page.getByLabel(fieldLabel('Pergunta'))).toHaveCount(1);
  await expect(page.getByLabel(fieldLabel('Pergunta'))).toHaveValue('Funciona offline?');

  // Sem texto alternativo nem decorativa: recusado com a mensagem junto do campo.
  await page.getByRole('button', { name: 'Criar', exact: true }).click();
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
  await page.getByRole('button', { name: 'Criar', exact: true }).click();

  // Fica no editor do conteúdo criado (#109), com a confirmação no toast, fora do main (#326).
  await expect(page).toHaveURL(/\/sites\/exemplo-a\/conteudos\/\d+\/editar$/);
  await expect(page.getByRole('heading', { name: `Editar “${title}”` })).toBeVisible();
  await expect(toastRegion(page)).toContainText('Conteúdo criado.');

  await page.goto('/sites/exemplo-a/conteudos');
  const row = page.getByRole('row', { name: new RegExp(title) });
  await expect(row).toContainText('Artigo');
  await expect(row).toContainText('Rascunho');
});

// Campos de imagem, de entidades e de data no Ecme (#272, #331): com os seletores abertos (#280) e com a
// capa escolhida (miniatura, "Trocar" e "Remover" na tela), sem violação do axe nos dois temas.
for (const colorScheme of ['light', 'dark'] as const) {
  test(`campos de imagem, entidades e data sem violação do axe (${colorScheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await loginAs(page, 'editor@orakel.local');
    await page.goto('/sites/exemplo-a/conteudos/novo');
    await expect(page.getByRole('heading', { name: 'Criar conteúdo' })).toBeVisible();

    const cover = page.getByRole('group', { name: 'Capa', exact: true });
    await cover.getByRole('button', { name: 'Escolher imagem' }).click();
    const grid = page.getByRole('dialog', { name: 'Escolher imagem' });
    // O seletor aberto (Dialog do Ecme, #280), com a grade e a paginação.
    await expect(grid.getByRole('status')).toHaveText(/^Página 1 de \d+ · \d+ image(m|ns)$/);
    await expect(grid.getByRole('navigation', { name: 'Paginação' })).toBeVisible();
    await page.mouse.move(0, 0);
    const picker = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(picker.violations).toEqual([]);
    await grid
      .getByRole('button', { name: /^Mídia \d+ · \d+×\d+$/ })
      .first()
      .click();
    await expect(grid).toBeHidden();
    await expect(cover.getByRole('button', { name: 'Remover' })).toBeVisible();
    const authors = page.getByRole('combobox', { name: fieldLabel('Autores') });
    await expect(authors).toBeVisible();
    await expect(page.getByRole('combobox', { name: fieldLabel('Taxonomias') })).toBeVisible();
    const date = page.getByRole('combobox', { name: 'Data de publicação' });
    await expect(date).toBeVisible();

    await page.mouse.move(0, 0);
    const accessibility = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(accessibility.violations).toEqual([]);
    // Select múltiplo dos autores (#330) aberto pelo teclado, sem violação com a lista aberta.
    await authors.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('listbox')).toBeVisible();
    const withMenu = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(withMenu.violations).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);

    // A data é o DateTimepicker do Ecme (#331): o painel aberto, sem violação; Esc fecha e
    // devolve o foco ao campo.
    await date.focus();
    await page.keyboard.press('Enter');
    const datePanel = page.getByRole('dialog', { name: 'Escolher data e hora' });
    await expect(datePanel).toBeVisible();
    await page.mouse.move(0, 0);
    expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(datePanel).toBeHidden();
    await expect(date).toBeFocused();

    // "Remover" da capa confirma num diálogo (#327), sem violação com ele aberto: Cancelar
    // mantém a imagem; "Remover" esvazia o campo e leva o foco a "Escolher imagem".
    const remove = cover.getByRole('button', { name: 'Remover' });
    const dialog = page.getByRole('alertdialog', { name: 'Remover a imagem de Capa?' });
    await remove.click();
    await expect(dialog).toBeVisible();
    const withDialog = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(withDialog.violations).toEqual([]);
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(remove).toBeFocused();
    await remove.click();
    await dialog.getByRole('button', { name: 'Remover' }).click();
    await expect(cover.getByText('Nenhuma imagem')).toBeVisible();
    await expect(cover.getByRole('button', { name: 'Escolher imagem' })).toBeFocused();
  });
}

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

// Histórico de versões e leitura de uma versão no Ecme (#271): Table e Tag sem violação do axe.
for (const colorScheme of ['light', 'dark'] as const) {
  test(`versões e uma versão sem violação do axe (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await loginAs(page, 'editor@orakel.local');
    await page.goto('/sites/exemplo-a/conteudos');
    await page
      .getByRole('table')
      .getByRole('link', { name: / \(versões\)$/ })
      .first()
      .click();
    await expect(page.getByRole('heading', { level: 1, name: /^Versões de/ })).toBeVisible();
    const versions = page.url();
    for (const path of [versions, `${versions}/versoes/1`]) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const accessibility = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      expect(accessibility.violations).toEqual([]);
    }
  });
}

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

  // Lista cheia na Table do Ecme (#273): a 1280 px nada rola na horizontal, nenhuma célula
  // passa de duas linhas de texto e o axe não acha violação, nos dois temas.
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`lista cheia a 1280 px, até duas linhas por célula, sem violação do axe (${colorScheme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await loginAs(page, 'editor@orakel.local');
      await page.goto(`/sites/${BIG_SITE}/conteudos`);
      expect(page.viewportSize()?.width).toBe(1280);
      const table = page.getByRole('table');
      await expect(table.locator('tbody tr')).toHaveCount(25);

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
    const save = page.getByRole('button', { name: 'Salvar', exact: true });

    for (const position of [0, 0.5, 1]) {
      await page.evaluate((fraction) => {
        window.scrollTo(0, (document.body.scrollHeight - window.innerHeight) * fraction);
      }, position);
      await expect(save).toBeInViewport();
    }
    const toast = toastRegion(page);

    await save.click();
    await expect(toast).toContainText('Versão 2 salva.');
    await expect(page).toHaveURL(new RegExp(`${editPath}$`));
    await expect(page.getByText('Partindo da versão 2;')).toBeVisible();

    // Salvar de novo sem mudar nada: nova versão, os mesmos 20 blocos.
    await save.click();
    await expect(toast).toContainText('Versão 3 salva.');
    await expect(page.getByRole('group', { name: /^Bloco \d+:/ })).toHaveCount(20);
    await expect(page.getByRole('main').getByRole('alert')).toHaveText('');
  });

  // Remover bloco se desfaz pelo toast (#112, #326): sem região nem botão no rodapé.
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`remover bloco mostra o toast com Desfazer, que o devolve (${colorScheme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await loginAs(page, 'editor@orakel.local');
      await page.goto(`/sites/exemplo-a/conteudos/${contentId}/editar`);
      const blocks = page.getByRole('group', { name: /^Bloco \d+:/ });
      await expect(blocks).toHaveCount(20);

      await page.getByRole('button', { name: 'Remover bloco 2', exact: true }).click();
      const undo = toastRegion(page).getByRole('button', { name: 'Desfazer' });
      await expect(toastRegion(page)).toContainText('Bloco 2 removido.');
      await expect(blocks).toHaveCount(19);
      await expect(page.getByRole('main').getByRole('button', { name: 'Desfazer' })).toHaveCount(0);
      await page.mouse.move(0, 0);
      const accessibility = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      expect(accessibility.violations).toEqual([]);

      await undo.click();
      await expect(blocks).toHaveCount(20);
      await expect(page.getByLabel('Título do sumário').nth(1)).toBeFocused();
      await expect(toastRegion(page)).toContainText('Bloco 2 devolvido.');
      await expect(undo).toHaveCount(0);
    });
  }

  test('com alterações não salvas, sair pede confirmação; depois de salvar, não (#111)', async ({
    page,
  }) => {
    await loginAs(page, 'editor@orakel.local');
    const editPath = `/sites/exemplo-a/conteudos/${contentId}/editar`;
    await page.goto(editPath);
    const titleField = page.getByLabel(fieldLabel('Título'));
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
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(toastRegion(page)).toContainText(/Versão \d+ salva\./);
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

  // Formulário do template (#332): metadados e blocos em Card, a barra fixa na largura do main,
  // e "Voltar" (edição) passa pelo aviso de saída.
  test('editor no formulário do template: cartões, barra na largura do main e Voltar (#332)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await loginAs(page, 'editor@orakel.local');
    const editPath = `/sites/exemplo-a/conteudos/${contentId}/editar`;
    await page.goto(editPath);
    await page.waitForLoadState('networkidle');

    // Todo campo dos metadados e dos blocos dentro de um Card (o tipo do novo bloco é da lista).
    const newType = await page
      .getByRole('combobox', { name: 'Tipo do novo bloco' })
      .getAttribute('id');
    const controls = page
      .locator('main form')
      .locator(`input:not([type=hidden]):not([id="${newType}"]), textarea`);
    for (const control of await controls.all()) {
      expect(await control.evaluate((el) => el.closest('.card') !== null)).toBe(true);
    }
    // A barra encosta nas bordas do main, com os três botões na mesma altura.
    const save = page.getByRole('button', { name: 'Salvar', exact: true });
    const bar = page.locator('.sticky').filter({ has: save });
    const main = await page.locator('main').boundingBox();
    const barBox = await bar.boundingBox();
    expect(barBox?.x).toBe(main?.x);
    expect(barBox?.width).toBe(main?.width);
    const back = bar.getByRole('link', { name: 'Voltar' });
    const heights = await Promise.all(
      [back, bar.getByRole('link', { name: /Ver prévia/ }), save].map(
        async (control) => (await control.boundingBox())?.height,
      ),
    );
    expect(new Set(heights).size).toBe(1);

    // Com alteração, Voltar pergunta: cancelar fica; confirmar vai para o conteúdo.
    const titleField = page.getByLabel(fieldLabel('Título'));
    await titleField.fill(`${title} (voltar)`);
    page.once('dialog', (dialog) => void dialog.dismiss());
    await back.click();
    await expect(page).toHaveURL(new RegExp(`${editPath}$`));
    await expect(titleField).toHaveValue(`${title} (voltar)`);
    page.once('dialog', (dialog) => void dialog.accept());
    await back.click();
    await expect(page).toHaveURL(new RegExp(`/conteudos/${contentId}$`));
  });

  test('criar: Descartar confirma num diálogo e volta à lista sem criar (#332)', async ({
    page,
  }) => {
    const draft = `Descartado ${Date.now()}`;
    await loginAs(page, 'editor@orakel.local');
    await page.goto('/sites/exemplo-a/conteudos/novo');
    await page.getByLabel(fieldLabel('Título')).fill(draft);
    page.on('dialog', (dialog) => {
      throw new Error(`aviso inesperado: ${dialog.type()}`);
    });

    await page.getByRole('button', { name: 'Descartar' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Descartar o que foi preenchido?' });
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByLabel(fieldLabel('Título'))).toHaveValue(draft);

    await page.getByRole('button', { name: 'Descartar' }).click();
    await dialog.getByRole('button', { name: 'Descartar' }).click();
    await expect(page).toHaveURL(/\/sites\/exemplo-a\/conteudos$/);
    await expect(page.getByRole('row', { name: new RegExp(draft) })).toHaveCount(0);
    page.removeAllListeners('dialog');
  });

  test('insere um bloco no meio só pelo teclado; Esc fecha a lista e devolve o foco (#134)', async ({
    page,
  }) => {
    await loginAs(page, 'editor@orakel.local');
    await page.goto(`/sites/exemplo-a/conteudos/${contentId}/editar`);
    const trigger = page.getByRole('button', { name: 'Inserir bloco na posição 2', exact: true });
    const menu = page.getByRole('menu');

    // O Dropdown do Ecme (#274): Enter abre o menu, Esc fecha e devolve o foco ao gatilho.
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(menu).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();

    // Abre de novo e chega ao "Sumário" pelas setas.
    await page.keyboard.press('Enter');
    const toc = menu.getByRole('menuitem', { name: 'Sumário' });
    for (let step = 0; step < 6; step += 1) {
      if (await toc.evaluate((node) => node === document.activeElement)) break;
      await page.keyboard.press('ArrowDown');
    }
    await expect(toc).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(menu).toBeHidden();
    const inserted = page.getByRole('group', { name: 'Bloco 2: Sumário', exact: true });
    await expect(inserted.getByLabel('Título do sumário')).toBeFocused();
    await expect(inserted.getByLabel('Título do sumário')).toHaveValue('');
    await expect(page.getByRole('group', { name: /^Bloco \d+:/ })).toHaveCount(21);
    await expect(page.getByRole('button', { name: 'Remover bloco 21', exact: true })).toBeVisible();
  });

  // Editor no Ecme (#274): com um bloco recolhido, o menu de inserir aberto e o rodapé fixo,
  // sem violação do axe nos dois temas.
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`editar sem violação do axe (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await loginAs(page, 'editor@orakel.local');
      await page.goto(`/sites/exemplo-a/conteudos/${contentId}/editar`);
      await page.getByRole('button', { name: 'Conteúdo do bloco 1', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Salvar', exact: true })).toBeInViewport();
      await page.getByRole('button', { name: 'Inserir bloco na posição 2', exact: true }).click();
      await expect(page.getByRole('menu')).toBeVisible();
      // O menu entra com transição de opacidade (mesmo com movimento reduzido); o axe audita
      // depois dela, senão mede o texto ainda translúcido.
      await expect(page.locator('.dropdown-menu')).toHaveCSS('opacity', '1');

      await page.mouse.move(0, 0);
      // As guardas de foco do floating-ui (`aria-hidden` e `tabindex=0`, repassam o foco na
      // hora) ficam de fora, como em components.spec.ts.
      const accessibility = await new AxeBuilder({ page })
        .withTags(WCAG)
        .exclude('[data-floating-ui-focus-guard]')
        .analyze();
      expect(accessibility.violations).toEqual([]);
    });
  }

  // Texto rico no Ecme (#275): barra, conteúdo e o popover de link aberto com o erro do campo,
  // sem violação do axe nos dois temas. Não salva: o conteúdo da seção fica como está.
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`texto rico com o popover de link sem violação do axe (${colorScheme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await loginAs(page, 'editor@orakel.local');
      await page.goto(`/sites/exemplo-a/conteudos/${contentId}/editar`);
      // Os 20 blocos daqui são sumários: um bloco de texto novo traz o editor.
      await addBlock(page, 'Texto');
      await page.getByRole('textbox', { name: 'Texto', exact: true }).fill('Primeiro parágrafo.');
      const toolbar = page.getByRole('toolbar', { name: 'Formatação: Texto' });
      const linkButton = toolbar.getByRole('button', { name: 'Link', exact: true });
      const linkPopover = page.locator(`[id="${await linkButton.getAttribute('popovertarget')}"]`);
      const href = linkPopover.getByLabel('Endereço do link');
      await linkButton.focus();
      await page.keyboard.press('Enter');
      await expect(href).toBeFocused();
      await page.keyboard.type('javascript:alert(1)');
      await page.keyboard.press('Enter');
      await expect(href).toHaveAttribute('aria-invalid', 'true');

      await page.mouse.move(0, 0);
      const accessibility = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      expect(accessibility.violations).toEqual([]);
    });
  }

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
