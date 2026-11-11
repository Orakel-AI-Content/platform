import { expect, test, type Page } from '@playwright/test';
import { and, eq } from 'drizzle-orm';

import { readFixture } from '../../src/bin/seed.ts';
import { createDb, createPool } from '../../src/db/client.ts';
import { redirects } from '../../src/db/schema/index.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
import { createContent } from '../../src/domain/content/contents.ts';
import { getEnv } from '../../src/env.ts';
import { asRole } from './auth.ts';
import { addBlock } from './blocks.ts';
import { fieldLabel } from './fieldLabel.ts';
import { chooseOption } from './select.ts';

// Fluxos críticos do conteúdo (ADR 0019 da raiz): o editor cria um artigo com texto, imagem e
// FAQ e o acha na lista; o revisor não grava nada; despublicar grava o 301. Aparência, teclado e
// acessibilidade das telas ficam nos testes de componente (`*.browser.test.tsx`).

/** Região dos toasts (#212): o retorno das ações vai para ela, fora do main (#326). */
const toastRegion = (page: Page) => page.locator('[data-toast-placement="top-end"]');

test(
  'editor cria um artigo com texto, imagem e FAQ e o encontra na lista',
  { tag: '@smoke' },
  async ({ page }) => {
    const slug = `e2e-${Date.now()}`;
    const title = `Artigo ${slug}`;
    await asRole(page, 'editor');
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
    await page.getByRole('textbox', { name: 'Texto', exact: true }).click();
    await page.keyboard.type('Primeiro parágrafo do artigo.');

    // A imagem do bloco pela grade de miniaturas (#182).
    await addBlock(page, 'Imagem');
    const imageField = page.getByRole('group', { name: 'Mídia', exact: true });
    await imageField.getByRole('button', { name: 'Escolher imagem' }).click();
    const grid = page.getByRole('dialog', { name: 'Escolher imagem' });
    const firstImage = grid.getByRole('button', { name: /^Mídia \d+ · \d+×\d+$/ }).first();
    const chosen = (await firstImage.textContent()) ?? '';
    await firstImage.click();
    await expect(grid).toBeHidden();
    await expect(imageField.getByText(chosen, { exact: true }).first()).toBeVisible();

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
  },
);

test(
  'revisor não tem editor nem link para criar ou editar',
  { tag: '@smoke' },
  async ({ page }) => {
    await asRole(page, 'revisor');
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
    await page.getByRole('link', { name: 'Ir para o site Exemplo A — Guias' }).click();
    await expect(page).toHaveURL(/\/sites\/exemplo-a$/);
  },
);

// Despublicar no cabeçalho (#494): dois conteúdos no ar, gravados direto pelo domínio. Só com
// content.publish e o conteúdo no ar; confirmar com destino tira do ar e grava o 301. O foco e
// o seletor ficam em `UnpublishDialog.browser.test.tsx`.
test.describe('despublicar no cabeçalho do conteúdo (#494)', () => {
  const stamp = Date.now();
  const live = { title: `No ar ${stamp}`, slug: `no-ar-${stamp}`, path: '' };
  const target = { title: `Destino ${stamp}`, slug: `destino-${stamp}`, path: '' };

  test.beforeAll(async () => {
    const fixture = await readFixture('exemplo-a');
    const content = fixture.find((line) => line.type === 'content');
    if (content?.type !== 'content') throw new Error('fixture sem conteúdo');
    const pool = createPool(getEnv().DATABASE_URL);
    try {
      for (const item of [live, target]) {
        const created = await createDb(pool).transaction((tx) =>
          createContent(
            tx,
            SYSTEM_ACTOR,
            'exemplo-a',
            {
              ...content.data,
              kind: 'article',
              title: item.title,
              slug: item.slug,
              blocks: [{ new: true as const, type: 'toc' as const, title: 'Seção' }],
            },
            { status: 'publicado' },
          ),
        );
        if (!created.ok) throw new Error(JSON.stringify(created.issues));
        item.path = `/sites/exemplo-a/conteudos/${created.value.id}`;
      }
    } finally {
      await pool.end();
    }
  });

  test('só com content.publish e o conteúdo no ar; com destino, tira do ar e grava o 301', async ({
    page,
    browser,
  }) => {
    const editor = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
    await asRole(editor, 'editor');
    await editor.goto(live.path);
    await expect(editor.getByRole('heading', { level: 1, name: live.title })).toBeVisible();
    await expect(editor.getByRole('button', { name: 'Despublicar' })).toHaveCount(0);
    await editor.context().close();

    await asRole(page, 'revisor');
    await page.goto(live.path);
    await page.getByRole('button', { name: 'Despublicar' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Despublicar este conteúdo?' });
    await expect(dialog).toContainText(`/${live.slug}/ passa a responder 404`);
    await chooseOption(
      dialog.getByRole('combobox', { name: 'Redirecionar para (opcional)' }),
      `${target.title} (/${target.slug}/)`,
    );
    await expect(dialog).toContainText(`passa a redirecionar (301) para /${target.slug}/`);
    await dialog.getByRole('button', { name: 'Despublicar' }).click();

    await expect(toastRegion(page)).toContainText('Conteúdo despublicado, com o 301.');
    await expect(page.getByRole('button', { name: 'Despublicar' })).toHaveCount(0);
    const pool = createPool(getEnv().DATABASE_URL);
    try {
      const rows = await createDb(pool)
        .select({ to: redirects.to, status: redirects.status })
        .from(redirects)
        .where(and(eq(redirects.siteId, 'exemplo-a'), eq(redirects.from, `/${live.slug}/`)));
      expect(rows).toEqual([{ to: `/${target.slug}/`, status: 301 }]);
    } finally {
      await pool.end();
    }
  });
});
