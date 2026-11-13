import { expect, test } from '@playwright/test';

import { asRole } from './auth.ts';
import { removeSites } from './cleanup.ts';
import { fieldLabel } from './fieldLabel.ts';

// Fluxos críticos dos sites (ADR 0019 da raiz). Na pilha (`@stack`): o login pelo Access e a API
// de exportação fora do hostname público. Na camada `telas`: a operação cadastra, edita e publica
// um site, e o editor não configura. Também na pilha, a criação da infraestrutura pelo
// build-runner com o driver local (#826). Ciclo de vida, G1, janela, layout e acessibilidade
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

    // Operação baixa a lista de sites do OpenTofu (ADR 0011).
    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Baixar sites.auto.tfvars.json' }).click();
    expect((await download).suggestedFilename()).toBe('sites.auto.tfvars.json');
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

test('editor não cadastra nem edita a configuração', async ({ page }) => {
  await asRole(page, 'editor');
  await expect(page.getByRole('link', { name: 'Criar site' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /sites\.auto\.tfvars\.json/ })).toHaveCount(0);
  expect((await page.request.get('/sites/tfvars')).status()).toBe(403);

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
