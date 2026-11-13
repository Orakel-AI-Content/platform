import { CreateBucketCommand, DeleteBucketCommand } from '@aws-sdk/client-s3';
import { asc, eq } from 'drizzle-orm';
import { contentPath, mediaUrl } from '@orakel/core/v1';
import { expect, test, type Page } from '@playwright/test';

import { createDb, createPool, type Db } from '../../src/db/client.ts';
import { infraRuns, sites } from '../../src/db/schema/index.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
import { advanceLifecycle, pauseSiteManually } from '../../src/domain/builds/site-state.ts';
import { buildNow } from '../../src/domain/builds/schedule.ts';
import { createContent } from '../../src/domain/content/contents.ts';
import { listMedia } from '../../src/domain/content/media.ts';
import { scheduleSiteInfraDriftCheck } from '../../src/domain/infra/schedule.ts';
import { createSite, currentConfig } from '../../src/domain/sites/sites.ts';
import { getDatabaseUrl, getEnv } from '../../src/env.ts';
import { createS3Client } from '../../src/lib/s3.ts';
import { asRole } from './auth.ts';
import { removeSites } from './cleanup.ts';
import { fieldLabel } from './fieldLabel.ts';

// Fluxos críticos dos sites (ADR 0019 da raiz). Na pilha (`@stack`): o login pelo Access e a API
// de exportação fora do hostname público. Na camada `telas`: a operação cadastra, edita e publica
// um site, e o editor não configura. Também na pilha, a criação da infraestrutura pelo
// build-runner com o driver local (#826), a remoção dela (workspace#97) e a conferência, a
// reaplicação e o lote de reaplicação dos desatualizados (workspace#98). Ciclo de vida, G1, janela, layout e acessibilidade
// ficam nos testes de domínio e de componente.

/** Sites cadastrados por estes testes; removidos do banco no fim, mesmo se um falhar. */
const created: string[] = [];
test.afterAll(async () => {
  await removeSites(created);
});

test(
  'login pelo Access e registro de instâncias',
  { tag: ['@smoke', '@stack'] },
  async ({ page }) => {
    await page.goto('/sites');

    // Sem sessão, o Access (access-mock) pede login.
    await expect(page.getByRole('heading', { name: /Login de teste/ })).toBeVisible();
    await page.getByRole('link', { name: 'operacao@orakel.local' }).click();

    await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();
    const table = page.getByRole('table');
    await expect(table.getByRole('link', { name: 'Exemplo A — Guias' })).toBeVisible();
    await expect(table.getByRole('link', { name: 'Exemplo B — Receitas' })).toBeVisible();

    // A lista de sites do OpenTofu saiu (ADR 0027 da raiz): sem botão e sem rota.
    await expect(page.getByRole('link', { name: /sites\.auto\.tfvars\.json/ })).toHaveCount(0);
    expect((await page.request.get('/sites/tfvars')).status()).toBe(404);
  },
);

test(
  'a API de exportação não existe no hostname público',
  { tag: '@stack' },
  async ({ request }) => {
    const response = await request.get('/api/export/v1/sites/exemplo-a/snapshot', {
      headers: { authorization: 'Bearer local-build-token-0000000000000000' },
    });
    expect(response.status()).toBe(404);
  },
);

test('operação cadastra e edita um site', { tag: '@smoke' }, async ({ page }) => {
  const siteId = `e2e-${Date.now()}`;
  created.push(siteId);
  await asRole(page, 'operacao');
  // A ação fica no cabeçalho e, com a lista vazia, também no estado vazio (#87).
  await page.getByRole('link', { name: 'Criar site' }).first().click();
  await expect(page.getByRole('heading', { name: 'Criar site' })).toBeVisible();

  await page.getByLabel(fieldLabel('ID')).fill(siteId);
  await page.getByLabel(fieldLabel('Nome')).fill('Site do E2E');
  await page.getByRole('textbox', { name: 'Domínios' }).fill(`${siteId}.example.com`);
  await page.getByRole('radio', { name: /Editorial claro/ }).check();
  await page.getByRole('button', { name: 'Criar', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: siteId });
  await expect(row.getByText('Cadastrado', { exact: true })).toBeVisible();

  // Edição: versão nova da configuração, e a lista mostra o domínio principal novo.
  await page.goto(`/sites/${siteId}/configuracao`);
  await expect(page.getByLabel(fieldLabel('ID'))).toHaveAttribute('readonly', '');
  // Espera a página hidratar: um clique antes disso não chega ao onClick.
  await page.waitForLoadState('networkidle');
  await page.getByRole('textbox', { name: 'Domínios' }).fill(`novo.${siteId}.example.com`);
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'versão 2' })).toBeVisible();

  await page.goto('/sites');
  await expect(
    page
      .getByRole('row')
      .filter({ hasText: siteId })
      .getByText(`novo.${siteId}.example.com`, { exact: false }),
  ).toBeVisible();
});

test(
  'operação vê a publicação do site e o publica pela página',
  { tag: '@smoke' },
  async ({ page }) => {
    await asRole(page, 'operacao');
    await page.getByRole('link', { name: 'Exemplo A — Guias' }).click();
    await expect(page).toHaveURL(/\/sites\/exemplo-a$/);

    // Espera a página hidratar: um clique antes disso não chega ao onClick.
    await page.waitForLoadState('networkidle');
    // As ações de operação ficam nas etapas da aba Publicação (#648), não no cabeçalho.
    await expect(page.getByRole('button', { name: 'Mais ações: exemplo-a' })).toHaveCount(0);
    const steps = page.getByRole('list', { name: 'Etapas da publicação' });
    await expect(
      steps.getByRole('listitem').filter({ hasText: 'No ar' }).getByRole('button'),
    ).toHaveAccessibleName('Escolher outra versão exemplo-a');
    // Confirma num diálogo (#327): Cancelar não publica.
    const publish = steps
      .getByRole('listitem')
      .filter({ hasText: 'Build' })
      .getByRole('button', { name: 'Publicar agora exemplo-a' });
    const dialog = page.getByRole('alertdialog', { name: 'Publicar exemplo-a agora?' });
    await publish.click();
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: 'enfileirado' })).toHaveCount(0);
    await publish.click();
    await dialog.getByRole('button', { name: 'Publicar' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Build de exemplo-a enfileirado.' }),
    ).toBeVisible();
  },
);

test(
  'operação cria a infraestrutura do site, com falha e "Tentar de novo"',
  { tag: '@stack' },
  async ({ page }) => {
    // INFRA_DRIVER=local com INFRA_LOCAL_FAIL_STEP=regras (infra/local/compose.override.yaml):
    // a primeira criação de cada site falha em Regras; a nova tentativa só cria o que faltou.
    test.setTimeout(180_000);
    const siteId = `e2e-infra-${Date.now()}`;
    created.push(siteId);
    await asRole(page, 'operacao');
    await page.goto('/sites/novo');
    await page.waitForLoadState('networkidle');
    await page.getByLabel(fieldLabel('ID')).fill(siteId);
    await page.getByLabel(fieldLabel('Nome')).fill('Site da infra do E2E');
    await page.getByRole('textbox', { name: 'Domínios' }).fill(`${siteId}.example.com`);
    await page.getByRole('radio', { name: /Editorial claro/ }).check();
    await page.getByRole('button', { name: 'Criar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();

    await page.goto(`/sites/${siteId}`);
    // Espera a página hidratar: um clique antes disso não chega ao onClick.
    await page.waitForLoadState('networkidle');
    const infra = page
      .getByRole('list', { name: 'Etapas da publicação' })
      .getByRole('listitem')
      .filter({ hasText: 'Infra e zona' });
    const dialog = page.getByRole('alertdialog', { name: 'Criar a infraestrutura do site?' });
    const summary = dialog.getByRole('list', { name: 'Resumo por etapa' });
    // A faixa da criação, não a do build que o cadastro enfileirou nem o toast da confirmação.
    const live = page
      .getByRole('status')
      .getByText(/^Criação da infraestrutura (em andamento|concluída|falhou)/);
    // O build-runner pega a task do plano e a do apply na fila.
    const queue = { timeout: 60_000 };

    // Primeira criação: o resumo e só então o apply, que falha na etapa Regras.
    await infra.getByRole('button', { name: 'Criar infraestrutura' }).click();
    await expect(summary).toBeVisible(queue);
    await expect(summary.getByRole('listitem').filter({ hasText: 'Endereço' })).toContainText(
      '1 a criar',
    );
    await dialog.getByRole('button', { name: 'Confirmar' }).click();
    await expect(live).toContainText('falhou na etapa Regras', queue);
    await expect(live).toContainText('Falha simulada na etapa regras');

    // Nova tentativa: novo plano, só com o que faltou, e a conclusão com os nameservers.
    await infra
      .getByRole('button', { name: 'Tentar de novo a criação da infraestrutura' })
      .click(queue);
    await expect(summary).toBeVisible(queue);
    await expect(summary.getByRole('listitem').filter({ hasText: 'Endereço' })).toContainText(
      'Nada muda',
    );
    await expect(summary.getByRole('listitem').filter({ hasText: 'Regras' })).toContainText(
      '3 a criar',
    );
    await dialog.getByRole('button', { name: 'Confirmar' }).click();
    await expect(live).toContainText('Criação da infraestrutura concluída', queue);
    await expect(infra).toContainText('Infra aplicada, zona pendente', queue);
    await expect(infra).toContainText('ada.ns.orakel.localhost, bob.ns.orakel.localhost');

    // O histórico: as duas criações, com quem pediu e o resultado.
    // O item da linha do tempo começa pelo título; o da etapa, por "Infra e zona".
    const history = page.getByRole('listitem').filter({ hasText: /^Criação da infraestrutura/ });
    await expect(history).toHaveCount(2);
    await expect(history.nth(0)).toContainText('operacao@orakel.local');
    await expect(history.nth(0)).toContainText('Nameservers: ada.ns.orakel.localhost');
    await expect(history.nth(1)).toContainText('falhou na etapa Regras');
    await expect(history.nth(1)).toContainText('Motivo: Falha simulada na etapa regras');
  },
);

/** Unwrap de um `Result` do domínio no preparo do teste. */
function must<T>(result: { ok: true; value: T } | { ok: false; issues: unknown }): T {
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
}

test(
  'admin remove a infraestrutura do site, com falha e "Tentar de novo"',
  { tag: '@stack' },
  async ({ page, request }) => {
    // INFRA_DRIVER=local com INFRA_LOCAL_FAIL_STEP=regras: a primeira remoção de cada site falha
    // em Regras, depois de apagar o Worker e esvaziar a mídia; a nova tentativa conclui. No local,
    // o site é servido em <site>.localhost pelo edge-local e a mídia em media.<site>.localhost.
    test.setTimeout(300_000);
    const siteId = `e2e-remocao-${Date.now()}`;
    const domain = `${siteId}.localhost`;
    const bucket = `media-${siteId}`;
    created.push(siteId);
    const pool = createPool(getDatabaseUrl());
    const db = createDb(pool);
    const s3 = createS3Client(getEnv());
    const queue = { timeout: 60_000 };
    try {
      // Preparo: site com conteúdo e mídia publicados, infra marcada e o site pausado. O
      // s3-init só cria o bucket dos sites do seed; o deste site sai aqui.
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
      await asRole(page, 'admin');
      await page.goto('/sites/novo');
      await page.waitForLoadState('networkidle');
      await page.getByLabel(fieldLabel('ID')).fill(siteId);
      await page.getByLabel(fieldLabel('Nome')).fill('Site da remoção do E2E');
      await page.getByRole('textbox', { name: 'Domínios' }).fill(domain);
      await page.getByRole('radio', { name: /Editorial claro/ }).check();
      await page.getByRole('button', { name: 'Criar', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();

      await page.goto(`/sites/${siteId}/midia`);
      await page.getByRole('button', { name: 'Enviar imagens' }).first().click();
      await page
        .getByRole('dialog', { name: 'Enviar imagens' })
        .getByLabel(/^Solte as imagens aqui/)
        .setInputFiles(new URL('fixtures/foto-gps.jpg', import.meta.url).pathname);
      await expect(
        page
          .getByRole('list', { name: 'Envios' })
          .getByRole('listitem')
          .filter({ hasText: 'foto-gps.jpg' }),
      ).toContainText('pronta', queue);
      const [uploaded] = must(await listMedia(db, SYSTEM_ACTOR, siteId));
      const config = await currentConfig(db, siteId);
      if (uploaded?.variants[0] === undefined || config === undefined) {
        throw new Error(`Site ${siteId} sem mídia ou sem configuração`);
      }
      const variantUrl = mediaUrl(config, uploaded.variants[0].path);
      expect((await request.get(variantUrl)).status(), variantUrl).toBe(200);

      const slug = `e2e-remocao-${Date.now()}`;
      await db.transaction(async (tx) => {
        must(await advanceLifecycle(tx, SYSTEM_ACTOR, siteId, 'infra_aplicada'));
        must(await advanceLifecycle(tx, SYSTEM_ACTOR, siteId, 'zona_ativa'));
        must(
          await createContent(
            tx,
            SYSTEM_ACTOR,
            siteId,
            {
              kind: 'page',
              slug,
              title: 'Página da remoção',
              authorIds: [],
              taxonomyIds: [],
              publishedAt: new Date().toISOString(),
              blocks: [
                {
                  new: true,
                  type: 'text',
                  content: [
                    { type: 'paragraph', children: [{ type: 'text', text: 'Some com a infra.' }] },
                  ],
                },
              ],
            },
            { status: 'publicado' },
          ),
        );
        await buildNow(tx, siteId, SYSTEM_ACTOR.email);
      });
      const pageUrl = `https://${domain}${contentPath({ slug })}`;
      await expect
        .poll(async () => (await request.get(pageUrl)).status(), {
          message: `${pageUrl} publicado`,
          timeout: 150_000,
          intervals: [2_000],
        })
        .toBe(200);
      await db.transaction(async (tx) =>
        must(await pauseSiteManually(tx, SYSTEM_ACTOR, siteId, 'remoção da infra do E2E')),
      );

      await page.goto(`/sites/${siteId}`);
      // Espera a página hidratar: um clique antes disso não chega ao onClick.
      await page.waitForLoadState('networkidle');
      const infra = page
        .getByRole('list', { name: 'Etapas da publicação' })
        .getByRole('listitem')
        .filter({ hasText: 'Infra e zona' });
      const dialog = page.getByRole('alertdialog', {
        name: 'Remover a infraestrutura do site?',
      });
      const live = page
        .getByRole('status')
        .getByText(/^Remoção da infraestrutura (em andamento|concluída|falhou)/);
      const confirmRemoval = async () => {
        await expect(dialog.getByRole('list', { name: 'O que será apagado' })).toBeVisible(queue);
        await dialog.getByRole('textbox').fill(domain);
        await dialog.getByRole('button', { name: 'Remover' }).click();
      };

      // Primeira remoção: o Worker e a mídia saem, e o destroy falha na etapa Regras.
      await infra.getByRole('button', { name: 'Remover infraestrutura' }).click();
      await confirmRemoval();
      await expect(live).toContainText('falhou na etapa Regras', queue);
      await expect(live).toContainText('Falha simulada na etapa regras');

      // Nova tentativa: novo plano, o domínio digitado de novo e a conclusão.
      await infra
        .getByRole('button', { name: 'Tentar de novo a remoção da infraestrutura' })
        .click(queue);
      await confirmRemoval();
      await expect(live).toContainText('Remoção da infraestrutura concluída', queue);
      await expect(infra).toContainText('Infra e zona pendentes', queue);
      await expect(infra.getByRole('button', { name: 'Criar infraestrutura' })).toBeVisible();

      // O histórico: as duas remoções, distintas da criação, com quem pediu e o resultado.
      const history = page.getByRole('listitem').filter({ hasText: /^Remoção da infraestrutura/ });
      await expect(history).toHaveCount(2);
      await expect(history.nth(0)).toContainText('admin@orakel.local');
      await expect(history.nth(1)).toContainText('falhou na etapa Regras');
      await expect(history.nth(1)).toContainText('Motivo: Falha simulada na etapa regras');

      // Fora do ar: a página e a mídia dão 404; o conteúdo e a mídia seguem no Backoffice.
      expect((await request.get(pageUrl)).status(), pageUrl).toBe(404);
      expect((await request.get(variantUrl)).status(), variantUrl).toBe(404);
      await page.goto(`/sites/${siteId}/conteudos`);
      await expect(page.getByText('Página da remoção').first()).toBeVisible();
      await page.goto(`/sites/${siteId}/midia`);
      await expect(page.getByText('foto-gps.jpg').first()).toBeVisible();
    } finally {
      // O bucket fica vazio depois da remoção; numa falha no meio, o resto fica para o
      // `local:reset`.
      await s3.send(new DeleteBucketCommand({ Bucket: bucket })).catch(() => undefined);
      s3.destroy();
      await pool.end();
    }
  },
);

// INFRA_DRIVER=local com INFRA_LOCAL_DRIFT_SITES=e2e-drift-* e INFRA_LOCAL_FAIL_STEP=regras
// (infra/local/compose.override.yaml): a conferência dos sites e2e-drift-… sai desatualizada até
// uma reaplicação ok, e a primeira reaplicação de cada site falha em Regras. Ids novos a cada
// rodada: a memória do driver (reaplicados, falhas já forçadas) dura o processo do build-runner.
// Em série: o lote pega todos os desatualizados e só há um aberto por vez.
test.describe.serial('infraestrutura desatualizada', { tag: '@stack' }, () => {
  const stamp = Date.now();
  const single = `e2e-drift-${stamp}-0`;
  const batchSites = [`e2e-drift-${stamp}-1`, `e2e-drift-${stamp}-2`] as const;
  const queue = { timeout: 60_000 };
  const pool = createPool(getDatabaseUrl());
  const db = createDb(pool);
  test.afterAll(async () => {
    await pool.end();
  });

  /**
   * Cadastra o site (a configuração do exemplo-a com id, nome e domínio próprios), marca a infra
   * como aplicada e enfileira a conferência, como a partida do build-runner faria; espera o
   * resultado `desatualizado` gravado no site.
   */
  async function outdatedSite(siteId: string, name: string): Promise<void> {
    created.push(siteId);
    const base = await currentConfig(db, 'exemplo-a');
    if (base === undefined) throw new Error('exemplo-a sem configuração');
    await db.transaction(async (tx) => {
      must(
        await createSite(tx, SYSTEM_ACTOR, {
          ...base,
          siteId,
          name,
          domains: [`${siteId}.example.com`],
        }),
      );
      must(await advanceLifecycle(tx, SYSTEM_ACTOR, siteId, 'infra_aplicada'));
      await scheduleSiteInfraDriftCheck(tx, siteId);
    });
    await expect
      .poll(() => driftStatus(db, siteId), { message: `conferência de ${siteId}`, ...queue })
      .toBe('desatualizado');
  }

  test('a conferência mostra o site desatualizado na lista e no site', async ({ page }) => {
    await outdatedSite(single, 'Site desatualizado do E2E');
    await asRole(page, 'operacao');
    const row = page.getByRole('row').filter({ hasText: single });
    await expect(row.getByText('Infra desatualizada', { exact: true })).toBeVisible();

    await page.goto(`/sites/${single}`);
    await expect(infraStep(page)).toContainText('Infra desatualizada');
  });

  test('a reaplicação, depois de uma falha e "Tentar de novo", deixa o site em dia', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await asRole(page, 'operacao');
    await page.goto(`/sites/${single}`);
    // Espera a página hidratar: um clique antes disso não chega ao onClick.
    await page.waitForLoadState('networkidle');
    const infra = infraStep(page);
    const dialog = page.getByRole('alertdialog', { name: 'Reaplicar a infraestrutura do site?' });
    const summary = dialog.getByRole('list', { name: 'Resumo por etapa' });
    const live = page
      .getByRole('status')
      .getByText(/^Reaplicação da infraestrutura (em andamento|concluída|falhou)/);
    const confirmReapply = async () => {
      await expect(summary).toBeVisible(queue);
      await expect(summary.getByRole('listitem').filter({ hasText: 'Regras' })).toContainText(
        '1 a alterar',
      );
      await dialog.getByRole('button', { name: 'Confirmar' }).click();
    };

    // Primeira reaplicação: o resumo com a mudança simulada e a falha forçada em Regras.
    await infra.getByRole('button', { name: 'Reaplicar infraestrutura' }).click();
    await confirmReapply();
    await expect(live).toContainText('falhou na etapa Regras', queue);
    await expect(live).toContainText('Falha simulada na etapa regras');
    await expect(infra).toContainText('Infra desatualizada');

    // Nova tentativa: plano novo, a conclusão e o selo some.
    await infra
      .getByRole('button', { name: 'Tentar de novo a reaplicação da infraestrutura' })
      .click(queue);
    await confirmReapply();
    await expect(live).toContainText('Reaplicação da infraestrutura concluída', queue);
    await expect.poll(() => driftStatus(db, single), queue).toBe('em_dia');
    await page.reload();
    await expect(infraStep(page)).not.toContainText('Infra desatualizada');

    // O histórico: as duas reaplicações, com quem pediu, quando e o resultado.
    const history = page
      .getByRole('listitem')
      .filter({ hasText: /^Reaplicação da infraestrutura/ });
    await expect(history).toHaveCount(2);
    await expect(history.nth(0)).toContainText('operacao@orakel.local');
    await expect(history.nth(0).locator('time')).toBeVisible();
    await expect(history.nth(0)).toContainText('Infraestrutura em dia com a descrição atual');
    await expect(history.nth(1)).toContainText('falhou na etapa Regras');

    await page.goto('/sites');
    await expect(
      page.getByRole('row').filter({ hasText: single }).getByText('Infra desatualizada'),
    ).toHaveCount(0);
  });

  test('o lote para no site que falhou e os seguintes continuam desatualizados', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await outdatedSite(batchSites[0], 'Lote do E2E, primeiro');
    await outdatedSite(batchSites[1], 'Lote do E2E, segundo');
    // O lote pega todos os desatualizados: com outro na base, a ordem e a parada mudariam.
    const outdated = await db
      .select({ id: sites.id })
      .from(sites)
      .where(eq(sites.infraDriftStatus, 'desatualizado'))
      .orderBy(asc(sites.id));
    expect(outdated.map((row) => row.id)).toEqual([...batchSites]);

    await asRole(page, 'operacao');
    // Espera a página hidratar: um clique antes disso não chega ao onClick.
    await page.waitForLoadState('networkidle');
    const dialog = page.getByRole('alertdialog', {
      name: 'Reaplicar a infraestrutura dos sites desatualizados?',
    });
    await page.getByRole('button', { name: 'Reaplicar nos desatualizados' }).click();
    const toReapply = dialog.getByRole('list', { name: 'Sites a reaplicar' });
    await expect(toReapply).toBeVisible(queue);
    await expect(toReapply.getByRole('listitem', { name: 'Lote do E2E, primeiro' })).toBeVisible();
    await expect(toReapply.getByRole('listitem', { name: 'Lote do E2E, segundo' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Confirmar' }).click();

    // O primeiro falha em Regras, e o lote para: o segundo fica sem aplicar.
    await expect(page.getByRole('status', { name: 'Progresso da reaplicação' })).toContainText(
      'interrompida',
      queue,
    );
    const cardSites = page
      .getByRole('list', { name: 'Sites da reaplicação' })
      .getByRole('listitem');
    await expect(cardSites.filter({ hasText: 'Lote do E2E, primeiro' })).toContainText(
      'Falhou em Regras: Falha simulada na etapa regras (driver local)',
    );
    await expect(cardSites.filter({ hasText: 'Lote do E2E, segundo' })).toContainText(
      'Não aplicado',
    );

    // Os dois continuam desatualizados, e o segundo não teve execução aplicada.
    for (const siteId of batchSites) {
      await expect(
        page.getByRole('row').filter({ hasText: siteId }).getByText('Infra desatualizada'),
      ).toBeVisible(queue);
    }
    const runs = await db
      .select({ status: infraRuns.status })
      .from(infraRuns)
      .where(eq(infraRuns.siteId, batchSites[1]));
    expect(runs.map((run) => run.status)).toEqual(['cancelado']);
  });
});

/** O item "Infra e zona" das etapas da publicação, na página do site. */
function infraStep(page: Page) {
  return page
    .getByRole('list', { name: 'Etapas da publicação' })
    .getByRole('listitem')
    .filter({ hasText: 'Infra e zona' });
}

/** O resultado da última conferência da infra gravado no site. */
async function driftStatus(db: Db, siteId: string): Promise<string | null | undefined> {
  const [site] = await db
    .select({ status: sites.infraDriftStatus })
    .from(sites)
    .where(eq(sites.id, siteId));
  return site?.status;
}

test('editor não cadastra nem edita a configuração', async ({ page }) => {
  await asRole(page, 'editor');
  await expect(page.getByRole('link', { name: 'Criar site' })).toHaveCount(0);

  for (const path of ['/sites/novo', '/sites/exemplo-a/configuracao']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: 'Sem permissão' })).toBeVisible();
    await expect(page.locator('form')).toHaveCount(0);
  }

  // Na página do site, nenhuma ação da operação.
  await page.goto('/sites/exemplo-a');
  await expect(page.getByRole('heading', { level: 1, name: 'Exemplo A — Guias' })).toBeVisible();
  for (const name of [/^Marcar/, /^Publicar agora/, 'Registrar G1']) {
    await expect(page.getByRole('button', { name })).toHaveCount(0);
  }
  await expect(page.getByRole('link', { name: 'Editar configuração' })).toHaveCount(0);
});
