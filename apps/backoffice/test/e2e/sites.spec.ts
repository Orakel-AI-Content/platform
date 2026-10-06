import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

// E2E contra o ambiente local (pnpm local:up && pnpm local:seed): Caddy + access-mock +
// backoffice-web. O fluxo completo (site → autor → imagem → artigo → revisão → build)
// entra com os módulos Conteúdo, Mídia, Revisão e Publicação.

test('login pelo Access e registro de instâncias', async ({ page }) => {
  await page.goto('/sites');

  // Sem sessão, o Access (access-mock) pede login.
  await expect(page.getByRole('heading', { name: /Login de teste/ })).toBeVisible();
  await page.getByRole('link', { name: 'operacao@orakel.local' }).click();

  await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();
  await expect(page.getByText('operacao@orakel.local · operacao')).toBeVisible();
  const table = page.getByRole('table');
  await expect(table.getByRole('cell', { name: 'exemplo-a', exact: true })).toBeVisible();
  await expect(table.getByRole('cell', { name: 'exemplo-b', exact: true })).toBeVisible();

  // Operação baixa a lista de sites do OpenTofu (ADR 0011).
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Baixar sites.auto.tfvars.json' }).click();
  expect((await download).suggestedFilename()).toBe('sites.auto.tfvars.json');

  // Operação enfileira o build do site sem esperar a janela (12.0, L3).
  await page.getByRole('button', { name: 'Publicar agora exemplo-a' }).click();
  await expect(page.getByText('Build de exemplo-a enfileirado.')).toBeVisible();

  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test('a API de exportação não existe no hostname público', async ({ request }) => {
  const response = await request.get('/api/export/v1/sites/exemplo-a/snapshot', {
    headers: { authorization: 'Bearer local-build-token-0000000000000000' },
  });
  expect(response.status()).toBe(404);
});

test('editor não vê o download do sites.auto.tfvars.json nem o baixa pela rota', async ({
  page,
}) => {
  await page.goto('/sites');
  await page.getByRole('link', { name: 'editor@orakel.local' }).click();

  await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();
  await expect(page.getByRole('link', { name: /sites\.auto\.tfvars\.json/ })).toHaveCount(0);
  expect((await page.request.get('/sites/tfvars')).status()).toBe(403);
});

// Cadastro e edição da configuração (#29): formulário só com teclado, erros anunciados e axe.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag22aa'];

async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto('/sites');
  await page.getByRole('link', { name: email }).click();
  await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();
}

/** Leva o foco até o controle só com Tab (no máximo 80 passos). */
async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let step = 0; step < 80; step += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('O controle não recebeu o foco pelo teclado');
}

async function typeInto(page: Page, target: Locator, text: string): Promise<void> {
  await tabTo(page, target);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(text);
}

test('operação cadastra e edita um site só com o teclado', async ({ page }) => {
  const siteId = `e2e-${Date.now()}`;
  await loginAs(page, 'operacao@orakel.local');
  await page.getByRole('link', { name: 'Cadastrar site' }).click();
  await expect(page.getByRole('heading', { name: 'Cadastrar site' })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);

  await typeInto(page, page.getByLabel('SITE_ID'), siteId);
  await typeInto(page, page.getByLabel('Nome', { exact: true }), 'Site do E2E');
  await typeInto(page, page.getByLabel('Domínios'), `${siteId}.example.com`);
  await typeInto(page, page.getByLabel('Tema'), 'padrao');
  await tabTo(page, page.getByRole('button', { name: 'Cadastrar site' }));
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: siteId });
  await expect(row.getByRole('cell', { name: 'Cadastrado', exact: true })).toBeVisible();

  // Edição: versão nova, e a lista mostra o domínio principal novo.
  await row.getByRole('link', { name: `Editar configuração ${siteId}` }).click();
  await expect(page.getByLabel('SITE_ID')).toHaveAttribute('readonly', '');
  await typeInto(page, page.getByLabel('Domínios'), `novo.${siteId}.example.com`);
  await tabTo(page, page.getByRole('button', { name: 'Salvar configuração' }));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'versão 2' })).toBeVisible();

  await page.goto('/sites');
  await expect(
    page
      .getByRole('row')
      .filter({ hasText: siteId })
      .getByRole('cell', {
        name: `novo.${siteId}.example.com`,
      }),
  ).toBeVisible();
});

test('preset fora dos recursos é recusado com a mensagem do domínio', async ({ page }) => {
  const siteId = `e2e-preset-${Date.now()}`;
  await loginAs(page, 'operacao@orakel.local');
  await page.goto('/sites/novo');
  await page.getByLabel('SITE_ID').fill(siteId);
  await page.getByLabel('Nome', { exact: true }).fill('Preset forçado');
  await page.getByLabel('Domínios').fill(`${siteId}.example.com`);
  await page.getByLabel('Tema').fill('padrao');
  // Valor forçado: uma opção que RESOURCES não lista.
  const home = page.getByLabel('Preset da página Home');
  await home.evaluate((select: HTMLSelectElement) => {
    select.add(new Option('inexistente', 'inexistente'));
  });
  await home.selectOption('inexistente');
  await page.getByRole('button', { name: 'Cadastrar site' }).click();

  await expect(page.getByText('Preset "inexistente" de home não é suportado')).toBeVisible();
  await expect(home).toHaveAttribute('aria-invalid', 'true');
  await expect(home).toBeFocused();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Não foi possível salvar' }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
});

test('editor não cadastra nem edita a configuração', async ({ page }) => {
  await loginAs(page, 'editor@orakel.local');
  await expect(page.getByRole('link', { name: 'Cadastrar site' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Editar configuração/ })).toHaveCount(0);

  for (const path of ['/sites/novo', '/sites/exemplo-a/configuracao']) {
    await page.goto(path);
    await expect(page.getByRole('alert').filter({ hasText: 'Sem permissão' })).toBeVisible();
    await expect(page.locator('form')).toHaveCount(0);
  }
});
