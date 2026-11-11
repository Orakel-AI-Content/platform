import { contentPath } from '@orakel/core/v1';
import { expect, test, type Page } from '@playwright/test';

import { getDb } from '../../src/db/client.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
import {
  createEditorialContext,
  currentEditorialContext,
} from '../../src/domain/generation/editorial-contexts.ts';
import { currentConfig } from '../../src/domain/sites/sites.ts';
import { asRole } from './auth.ts';
import { fieldLabel } from './fieldLabel.ts';
import { chooseOption } from './select.ts';

// Geração de ponta a ponta (#543, workspace#23) contra a pilha local, com o backoffice-worker em
// LLM_MODEL=fixture (infra/local/compose.override.yaml): o editor dispara pela aba Geração, a
// execução termina, o artigo gerado passa pela revisão e chega ao site. É o fluxo de ponta a
// ponta do produto (ADR 0019 da raiz); a saída inválida do fixture e o custo ficam nos testes
// de domínio.

const SITE = 'exemplo-a';
const AUTHOR = 'Ana Souza';
const PREVIEW = 'https://preview.orakel.localhost';

test.setTimeout(240_000);

test.beforeAll(async () => {
  // O disparo exige o contexto editorial do site; o seed não traz nenhum.
  const { db } = getDb();
  if ((await currentEditorialContext(db, SITE)) === undefined) {
    const created = await createEditorialContext(
      db,
      SYSTEM_ACTOR,
      SITE,
      'Site de exemplo do E2E: artigos curtos e didáticos.',
    );
    if (!created.ok) throw new Error(JSON.stringify(created.issues));
  }
});

test.afterAll(async () => {
  await getDb().pool.end();
});

/** Dispara a geração do tema pela aba Geração, como editor. */
async function trigger(page: Page, topic: string): Promise<void> {
  await page.goto(`/sites/${SITE}/geracao`);
  await page.getByLabel(fieldLabel('Tema ou palavra-chave')).fill(topic);
  await chooseOption(page.getByRole('combobox', { name: fieldLabel('Autor') }), AUTHOR);
  await page.getByRole('button', { name: 'Gerar artigo' }).click();
  await expect(page.getByText('Geração enfileirada: acompanhe a execução na lista.')).toBeVisible();
}

/**
 * Linha da execução do tema na lista, depois de terminar: a lista não se atualiza sozinha
 * (#541), então recarrega até o status sair de "Pendente".
 */
async function finishedRow(page: Page, topic: string) {
  const row = page.getByRole('row').filter({ has: page.getByTitle(topic, { exact: true }) });
  await expect
    .poll(
      async () => {
        await page.reload();
        return (await row.first().textContent()) ?? '';
      },
      { message: `execução de ${topic} terminada`, timeout: 60_000, intervals: [2_000] },
    )
    .toMatch(/Concluída|Falhou/);
  return row.first();
}

test(
  'gerar pelo fixture, aprovar, publicar e achar o artigo no site',
  { tag: '@stack' },
  async ({ page, browser, request }) => {
    const topic = `e2e-geracao-${Date.now()}`;
    const title = `Artigo de teste: ${topic}`;
    await asRole(page, 'editor');
    await trigger(page, topic);

    const row = await finishedRow(page, topic);
    await expect(row).toContainText('Concluída');

    // O artigo gerado está na fila de revisão do site; o revisor aprova pelo checklist.
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const reviewer = await context.newPage();
    await asRole(reviewer, 'revisor');
    await reviewer.goto(`${PREVIEW}/${SITE}/`);
    await reviewer.getByRole('link', { name: 'revisor@orakel.local' }).click();
    await reviewer.goto(`/sites/${SITE}/revisao?q=${topic}`);
    await reviewer.getByRole('link', { name: `${title} (revisar)` }).click();
    await expect(
      reviewer.getByRole('heading', { level: 1, name: `Revisão de “${title}”` }),
    ).toBeVisible();
    await expect(reviewer.getByText('Nenhum problema de validação.')).toBeVisible();
    const items = reviewer.getByRole('checkbox');
    await expect(items).toHaveCount(5);
    for (let index = 0; index < 5; index += 1) {
      await items.nth(index).focus();
      await reviewer.keyboard.press('Space');
    }
    await reviewer.getByRole('button', { name: 'Aprovar' }).click();
    await expect(
      reviewer.getByRole('status').filter({ hasText: 'Versão 1 aprovada.' }),
    ).toBeVisible();

    // Publica pela página do conteúdo, aberta pelo link da execução.
    await page.reload();
    const contentLink = (await finishedRow(page, topic)).getByRole('link', { name: /^Conteúdo #/ });
    const href = await contentLink.getAttribute('href');
    expect(href).toMatch(new RegExp(`^/sites/${SITE}/conteudos/\\d+$`));
    await reviewer.goto(href!);
    await reviewer.getByRole('button', { name: 'Publicar', exact: true }).click();
    await expect(reviewer.getByRole('status').filter({ hasText: 'Publicado.' })).toBeVisible();
    await context.close();

    // O build da janela (30 s no local) leva o artigo ao site.
    const config = await currentConfig(getDb().db, SITE);
    if (config === undefined) throw new Error(`Site ${SITE} sem configuração`);
    const pageUrl = `https://${config.domains[0]}${contentPath({ slug: topic })}`;
    await expect
      .poll(async () => (await request.get(pageUrl)).status(), {
        message: `${pageUrl} publicado`,
        timeout: 150_000,
        intervals: [2_000],
      })
      .toBe(200);
    await page.goto(pageUrl);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  },
);
