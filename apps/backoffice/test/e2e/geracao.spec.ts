import { contentPath } from '@orakel/core/v1';
import { expect, test, type Page } from '@playwright/test';
import { and, eq, gt } from 'drizzle-orm';

import { getDb } from '../../src/db/client.ts';
import { generationRuns } from '../../src/db/schema/index.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
import {
  createEditorialContext,
  currentEditorialContext,
} from '../../src/domain/generation/editorial-contexts.ts';
import { FIXTURE_INVALID_TOPIC, FIXTURE_USAGE } from '../../src/domain/generation/fixture.ts';
import { currentConfig } from '../../src/domain/sites/sites.ts';
import { asRole } from './auth.ts';
import { fieldLabel } from './fieldLabel.ts';
import { chooseOption } from './select.ts';

// Geração de ponta a ponta (#543, workspace#23) contra a pilha local, com o backoffice-worker em
// LLM_MODEL=fixture (infra/local/compose.override.yaml): o editor dispara pela aba Geração, a
// execução termina com custo, o artigo gerado passa pela revisão e chega ao site. O tema
// FIXTURE_INVALID_TOPIC faz o fixture responder fora do schema: uma execução com falha, sem
// nova tentativa. O custo exige a entrada `fixture` no LLM_PRICING (.env.example).

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

/** Última execução do site, para separar as desta rodada das que o banco local acumula. */
async function lastRunId(): Promise<number> {
  const rows = await getDb()
    .db.select({ id: generationRuns.id })
    .from(generationRuns)
    .where(eq(generationRuns.siteId, SITE));
  return Math.max(0, ...rows.map((row) => row.id));
}

/** Execuções do tema criadas depois de `after`. */
async function runsOf(topic: string, after: number) {
  return getDb()
    .db.select({ id: generationRuns.id, status: generationRuns.status })
    .from(generationRuns)
    .where(
      and(
        eq(generationRuns.siteId, SITE),
        eq(generationRuns.topic, topic),
        gt(generationRuns.id, after),
      ),
    );
}

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
  'gerar pelo fixture, ver a execução com custo, aprovar, publicar e achar o artigo no site',
  { tag: '@stack' },
  async ({ page, browser, request }) => {
    const topic = `e2e-geracao-${Date.now()}`;
    const title = `Artigo de teste: ${topic}`;
    await asRole(page, 'editor');
    await trigger(page, topic);

    // Concluída, pelo fixture, com os tokens fixos e o custo (US$ 0,00035 na tabela do exemplo).
    const row = await finishedRow(page, topic);
    await expect(row).toContainText('Concluída');
    await expect(row).toContainText('fixture');
    await expect(row.getByRole('cell').nth(4)).toHaveText(
      `${FIXTURE_USAGE.inputTokens.toLocaleString('pt-BR')} de entrada` +
        `${FIXTURE_USAGE.outputTokens.toLocaleString('pt-BR')} de saída`,
    );
    await expect(row.getByRole('cell').nth(5)).toHaveText(/^\d+,\d+$/);

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

test(
  'saída inválida do fixture vira uma execução com falha, sem nova chamada',
  { tag: '@stack' },
  async ({ page }) => {
    const after = await lastRunId();
    await asRole(page, 'editor');
    await trigger(page, FIXTURE_INVALID_TOPIC);

    const row = await finishedRow(page, FIXTURE_INVALID_TOPIC);
    await expect(row).toContainText('Falhou');
    await expect(row.getByRole('cell').last()).toHaveText('—');

    // max_attempts 1 e maxRetries 0: a falha não gera outra execução nem outro job. Espera
    // além de um ciclo do worker antes de contar.
    await page.waitForTimeout(5_000);
    const runs = await runsOf(FIXTURE_INVALID_TOPIC, after);
    expect(runs.map((run) => run.status)).toEqual(['falha']);
    // A task registra a falha sem lançar: nenhum job da geração com erro esperando nova
    // tentativa (a view do graphile-worker não expõe o payload, só o erro e as tentativas).
    const jobs = await getDb().pool.query<{ count: string }>(
      `SELECT count(*) FROM graphile_worker.jobs
        WHERE task_identifier = 'generate-article' AND last_error IS NOT NULL`,
    );
    expect(Number(jobs.rows[0]?.count)).toBe(0);
  },
);
