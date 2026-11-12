import { expect, test } from '@playwright/test';

import { asRole } from './auth.ts';
import { removeSites } from './cleanup.ts';
import { fieldLabel } from './fieldLabel.ts';

// Fluxos críticos dos sites (ADR 0019 da raiz). Na pilha (`@stack`): o login pelo Access e a API
// de exportação fora do hostname público. Na camada `telas`: a operação cadastra, edita e publica
// um site, e o editor não configura. Ciclo de vida, G1, janela, layout e acessibilidade ficam nos
// testes de domínio e de componente.

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
