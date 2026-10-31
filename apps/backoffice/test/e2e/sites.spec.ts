import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

import { readFixture } from '../../src/bin/seed.ts';
import { createDb, createPool } from '../../src/db/client.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
import { pauseSite } from '../../src/domain/builds/site-state.ts';
import { createSite } from '../../src/domain/sites/sites.ts';
import { getDatabaseUrl } from '../../src/env.ts';
import { removeSites } from './cleanup.ts';
import { fieldLabel } from './fieldLabel.ts';

// E2E contra o ambiente local (pnpm local:up && pnpm local:seed): Caddy + access-mock +
// backoffice-web. O fluxo completo (site → autor → imagem → artigo → revisão → build)
// entra com os módulos Conteúdo, Mídia, Revisão e Publicação.

/** Sites cadastrados por estes testes; removidos do banco no fim, mesmo se um falhar. */
const created: string[] = [];
test.afterAll(async () => {
  await removeSites(created);
});

// O retorno das ações vai para o toast (#324): sem a entrada animada, o axe não mede o texto
// ainda transparente no meio do fade.
test.use({ reducedMotion: 'reduce' });

test('login pelo Access e registro de instâncias', { tag: '@smoke' }, async ({ page }) => {
  await page.goto('/sites');

  // Sem sessão, o Access (access-mock) pede login.
  await expect(page.getByRole('heading', { name: /Login de teste/ })).toBeVisible();
  await page.getByRole('link', { name: 'operacao@orakel.local' }).click();

  await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();
  await expect(page.getByText('operacao@orakel.local · operacao')).toBeVisible();
  const table = page.getByRole('table');
  // O nome é o link principal; o ID e o domínio ficam sob ele (#100).
  await expect(table.getByRole('link', { name: 'Exemplo A — Guias' })).toBeVisible();
  await expect(table.getByText(/^exemplo-a · /)).toBeVisible();
  await expect(table.getByRole('link', { name: 'Exemplo B — Receitas' })).toBeVisible();

  // Operação baixa a lista de sites do OpenTofu (ADR 0011).
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Baixar sites.auto.tfvars.json' }).click();
  expect((await download).suggestedFilename()).toBe('sites.auto.tfvars.json');

  // Operação enfileira o build do site sem esperar a janela (12.0, L3). Espera a página
  // hidratar: um clique antes disso não chega ao onClick (a ação nem é chamada).
  await page.waitForLoadState('networkidle');
  // Muda o site publicado: confirma num diálogo (#327).
  await page.getByRole('button', { name: 'Publicar agora exemplo-a' }).click();
  await page
    .getByRole('alertdialog', { name: 'Publicar exemplo-a agora?' })
    .getByRole('button', { name: 'Publicar' })
    .click();
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

async function expectNoViolations(page: Page): Promise<void> {
  const accessibility = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(accessibility.violations).toEqual([]);
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

test('operação cadastra e edita um site só com o teclado', { tag: '@smoke' }, async ({ page }) => {
  const siteId = `e2e-${Date.now()}`;
  created.push(siteId);
  await loginAs(page, 'operacao@orakel.local');
  // A ação fica no cabeçalho e, com a lista vazia, também no estado vazio (#87).
  await page.getByRole('link', { name: 'Criar site' }).first().click();
  await expect(page.getByRole('heading', { name: 'Criar site' })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);

  await typeInto(page, page.getByLabel(fieldLabel('ID')), siteId);
  await typeInto(page, page.getByLabel(fieldLabel('Nome')), 'Site do E2E');
  await typeInto(page, page.getByRole('textbox', { name: 'Domínios' }), `${siteId}.example.com`);
  // Tema (#163): escolhido no grupo, pelo nome legível, só com o teclado.
  await tabTo(page, page.getByRole('radio', { name: /Editorial claro/ }));
  await page.keyboard.press('Space');
  await expect(page.getByRole('radio', { name: /Editorial claro/ })).toBeChecked();
  // Preset (#330): o Select do Ecme, ligado ao rótulo do FormItem, abre na seta e escolhe no
  // Enter a opção em foco (a atual, que segue no valor).
  const home = page.getByRole('combobox', { name: fieldLabel('Preset da página Home') });
  const current = await page
    .locator('.select', { has: home })
    .locator('.select-single-value')
    .textContent();
  await tabTo(page, home);
  await page.keyboard.press('ArrowDown');
  await expect(home).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('option', { name: current ?? '' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(home).toHaveAttribute('aria-expanded', 'false');
  await tabTo(page, page.getByRole('button', { name: 'Criar', exact: true }));
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();
  // A confirmação do cadastro aparece no toast (#324).
  await expect(
    page.getByRole('status').filter({ hasText: `Site ${siteId} cadastrado.` }),
  ).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: siteId });
  await expect(row.getByText('Cadastrado', { exact: true })).toBeVisible();

  // Edição pelo menu "Mais ações" (#100), só com o teclado: versão nova, e a lista mostra o
  // domínio principal novo.
  // O menu é o Dropdown do Ecme (#248): Enter abre com o foco no primeiro item; as setas
  // chegam ao de editar.
  await tabTo(page, row.getByRole('button', { name: `Mais ações: ${siteId}` }));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu').getByRole('menuitem').first()).toBeFocused();
  const edit = page
    .getByRole('menu')
    .getByRole('menuitem', { name: `Editar configuração ${siteId}` });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(edit).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel(fieldLabel('ID'))).toHaveAttribute('readonly', '');
  // Seções com índice (#161): o item do índice leva à seção, e o Tab seguinte entra nela.
  const sections = page.getByRole('navigation', { name: 'Seções do formulário' });
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Identidade',
    'Domínios',
    'Aparência',
    'Recursos',
    'Robôs e indexação',
    'Integrações',
  ]);
  await tabTo(page, sections.getByRole('link', { name: 'Domínios' }));
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#secao-dominios$/);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('textbox', { name: 'Domínios' })).toBeFocused();
  await typeInto(
    page,
    page.getByRole('textbox', { name: 'Domínios' }),
    `novo.${siteId}.example.com`,
  );
  await tabTo(page, page.getByRole('button', { name: 'Salvar', exact: true }));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'versão 2' })).toBeVisible();

  await page.goto('/sites');
  await expect(
    page
      .getByRole('row')
      .filter({ hasText: siteId })
      .getByText(`${siteId} · novo.${siteId}.example.com`),
  ).toBeVisible();
});

// Preset fora dos recursos (#330): o Select do Ecme não aceita injetar uma opção pela página,
// como o `<select>` nativo aceitava. A recusa do domínio fica em `src/app/(admin)/sites/actions.test.ts`,
// o caminho até o campo (foco, `aria-invalid`, descrição) em `SiteConfigForm.test.tsx` e o
// Select inválido no FormItem, com o axe, no teste de componente (`Select.browser.test.tsx`).

// Formulário no visual do Ecme (#245): cadastro e configuração sem violação do axe nos dois
// temas, com as seções em Card e os campos do FormItem.
test(`cadastro e configuração sem violação do axe`, async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await loginAs(page, 'operacao@orakel.local');

  for (const [path, heading] of [
    ['/sites/novo', 'Criar site'],
    ['/sites/exemplo-a/configuracao', 'Identidade'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations, path).toEqual([]);
  }

  // Remover recurso confirma num diálogo (#327), sem violação com ele aberto; Cancelar não
  // remove e devolve o foco, "Remover" tira a linha. Nada é salvo.
  await page.waitForLoadState('networkidle');
  const flags = page.getByRole('group', { name: 'Recursos ligados' });
  const names = flags.getByLabel(/^Nome do recurso/);
  const count = await names.count();
  await flags.getByRole('button', { name: 'Adicionar recurso' }).click();
  await expect(names).toHaveCount(count + 1);
  // O liga/desliga é o Switcher do Ecme (#331): a linha nova entra ligada e o Espaço desliga.
  const enabled = flags.getByRole('switch', { name: `Recurso ${count + 1} ligado` });
  await expect(enabled).toBeChecked();
  await enabled.focus();
  await page.keyboard.press('Space');
  await expect(enabled).not.toBeChecked();
  const remove = flags.getByRole('button', { name: `Remover recurso ${count + 1}` });
  const dialog = page.getByRole('alertdialog', { name: `Remover recurso ${count + 1}?` });
  await remove.click();
  await expect(dialog).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(remove).toBeFocused();
  await remove.click();
  await dialog.getByRole('button', { name: 'Remover' }).click();
  await expect(names).toHaveCount(count);
});

// Configuração no formulário do template (#328): seções em Card, ID e Nome lado a lado, a barra
// fixa na largura do main e Voltar para a página do site, sem salvar.
test('configuração: pares lado a lado, barra na largura do main e Voltar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await loginAs(page, 'operacao@orakel.local');
  await page.goto('/sites/exemplo-a/configuracao');
  await expect(page.getByRole('heading', { name: 'Identidade' })).toBeVisible();
  await page.waitForLoadState('networkidle');

  const identity = page.getByRole('region', { name: 'Identidade' });
  for (const [first, second] of [
    ['ID', 'Nome'],
    ['Idioma', 'Fuso horário'],
  ] as const) {
    const a = await identity.getByLabel(fieldLabel(first)).boundingBox();
    const b = await identity.getByLabel(fieldLabel(second)).boundingBox();
    expect(a?.y).toBe(b?.y);
  }
  const bar = page
    .locator('.sticky')
    .filter({ has: page.getByRole('button', { name: 'Salvar', exact: true }) });
  const main = await page.locator('main').boundingBox();
  const barBox = await bar.boundingBox();
  expect(barBox?.x).toBe(main?.x);
  expect(barBox?.width).toBe(main?.width);

  await identity.getByLabel(fieldLabel('Nome')).fill('Nome que não fica');
  await bar.getByRole('link', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(/\/sites\/exemplo-a$/);
  await expect(page.getByText('Nome que não fica')).toHaveCount(0);
});

// Vocabulário do guia (#385): o h1, a aba e o item corrente da trilha dizem "Configuração do site".
test('configuração: h1, aba e trilha dizem Configuração do site', async ({ page }) => {
  await loginAs(page, 'operacao@orakel.local');
  await page.goto('/sites/exemplo-a/configuracao');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Configuração do site', exact: true }),
  ).toBeVisible();
  await expect(page).toHaveTitle('Configuração do site · Exemplo A — Guias · Orakel Backoffice');
  await expect(
    page.getByRole('navigation', { name: 'Trilha de navegação' }).locator('[aria-current="page"]'),
  ).toHaveText('Configuração do site');
});

test('editor não cadastra nem edita a configuração', async ({ page }) => {
  await loginAs(page, 'editor@orakel.local');
  await expect(page.getByRole('link', { name: 'Criar site' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Editar configuração/ })).toHaveCount(0);

  for (const path of ['/sites/novo', '/sites/exemplo-a/configuracao']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: 'Sem permissão' })).toBeVisible();
    await expect(
      page.getByText('Configurar os sites exige o papel admin ou operacao.'),
    ).toBeVisible();
    await expect(page.locator('form')).toHaveCount(0);
  }
});

// Página do site (#30): ciclo de vida, G1 e janela de agrupamento, nas abas do detalhe (#370).

/** O resumo do site (#370): o único cartão da página com a lista de dados. */
const siteSummary = (page: Page) => page.locator('.card').filter({ has: page.locator('dl') });

/** Abre a aba `name` da página do site e devolve o painel dela. */
async function openTab(page: Page, name: string): Promise<Locator> {
  await page.getByRole('tab', { name }).click();
  const panel = page.getByRole('tabpanel', { name });
  await expect(panel).toBeVisible();
  return panel;
}

async function newSite(page: Page, siteId: string): Promise<void> {
  await page.goto('/sites/novo');
  await page.getByLabel(fieldLabel('ID')).fill(siteId);
  await page.getByLabel(fieldLabel('Nome')).fill(`Site ${siteId}`);
  await page.getByRole('textbox', { name: 'Domínios' }).fill(`${siteId}.example.com`);
  await page.getByRole('radio', { name: /Editorial claro/ }).check();
  await page.getByRole('button', { name: 'Criar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();
}

const status = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text });

test('operação marca as etapas, registra o G1 e define a janela do site', async ({ page }) => {
  const siteId = `e2e-pagina-${Date.now()}`;
  created.push(siteId);
  await loginAs(page, 'operacao@orakel.local');
  await newSite(page, siteId);
  await page.getByRole('link', { name: `Site ${siteId}`, exact: true }).click();
  await expect(page.getByRole('heading', { name: new RegExp(siteId) })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);

  // Ciclo de vida: quatro etapas em ordem; só o próximo passo manual, no item que ele conclui.
  // A aba aberta ao entrar é a do ciclo de vida.
  const steps = page.getByRole('tabpanel', { name: 'Ciclo de vida' }).getByRole('list');
  const currentStep = steps.locator('[aria-current="step"]');
  await expect(steps.getByRole('listitem')).toHaveCount(4);
  await expect(currentStep).toContainText('Cadastrado (atual)');
  await steps
    .getByRole('listitem')
    .filter({ hasText: 'Infra aplicada' })
    .getByRole('button', { name: 'Marcar infra aplicada' })
    .click();
  await expect(status(page, 'Infra aplicada marcada.')).toBeVisible();
  await expect(currentStep).toContainText('Infra aplicada (atual)');
  await expect(steps.getByRole('listitem').first()).toContainText('(concluída)');
  await page.getByRole('button', { name: 'Marcar zona ativa' }).click();
  await expect(status(page, 'Zona ativa marcada.')).toBeVisible();
  await expect(currentStep).toContainText('Zona ativa (atual)');
  await expect(page.getByRole('button', { name: /^Marcar/ })).toHaveCount(0);

  // Indexação sem G1 é recusada; depois do G1 pela página, a mesma edição é aceita.
  const indexar = async () => {
    await page.goto(`/sites/${siteId}/configuracao`);
    // Indexável no Switcher do Ecme (#331), ligado pelo teclado.
    const indexavel = page.getByRole('switch', { name: 'Indexável' });
    await indexavel.focus();
    await page.keyboard.press('Space');
    await expect(indexavel).toBeChecked();
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  };
  await indexar();
  await expect(page.getByRole('switch', { name: 'Indexável' })).toHaveAccessibleDescription(
    /só pode ficar indexável depois do G1 registrado/,
  );
  await page.goto(`/sites/${siteId}`);
  await expect(siteSummary(page).getByText('Não registrado', { exact: true })).toBeVisible();
  const g1Panel = await openTab(page, 'G1 (indexação)');
  await g1Panel.getByLabel('Observação do G1').fill('Políticas publicadas');
  await g1Panel.getByRole('button', { name: 'Registrar G1' }).click();
  await expect(
    g1Panel.getByText(/Registrado por operacao@orakel\.local em .* — Políticas publicadas/),
  ).toBeVisible();
  await expect(siteSummary(page).getByText('Registrado', { exact: true })).toBeVisible();
  await indexar();
  await expect(status(page, 'versão 2')).toBeVisible();

  // Janela própria e volta à padrão; valor vazio, negativo ou não inteiro dá erro no campo,
  // pelo schema do formulário gerado (#333).
  await page.goto(`/sites/${siteId}`);
  const windowSection = await openTab(page, 'Janela de agrupamento');
  const windowInput = windowSection.getByLabel('Janela própria (segundos)');
  for (const value of ['', '-1', '1.5']) {
    await windowInput.fill(value);
    await windowSection.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(windowInput).toHaveAttribute('aria-invalid', 'true');
    await expect(windowInput).toHaveAccessibleDescription(
      'Informe um número inteiro de segundos, 0 ou mais.',
    );
  }
  await page.getByLabel('Janela própria (segundos)').fill('30');
  await windowSection.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(status(page, 'Janela de 30 s salva.')).toBeVisible();
  await expect(page.getByText('Janela efetiva: 30 s, própria')).toBeVisible();
  await expect(windowInput).not.toHaveAttribute('aria-invalid', 'true');
  await page.getByRole('button', { name: 'Usar padrão' }).click();
  await expect(status(page, 'Janela padrão restaurada.')).toBeVisible();
  await expect(page.getByText(/Janela efetiva: \d+ s( \(.+\))?, padrão/)).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);

  await page.goto('/sites');
  await expect(
    page.getByRole('row').filter({ hasText: siteId }).getByText('Zona ativa', { exact: true }),
  ).toBeVisible();
});

test(
  'operação vê a publicação do site e o publica pela página',
  { tag: '@smoke' },
  async ({ page }) => {
    await loginAs(page, 'operacao@orakel.local');
    await page.getByRole('link', { name: 'Exemplo A — Guias' }).click();
    // O resumo ao lado das abas (#370): os dados de publicação e "Publicar agora".
    const publication = siteSummary(page);
    const terms = [
      'Domínio',
      'Indexável',
      'Status',
      'Release',
      'Mudanças pendentes',
      'Último build',
      'G1',
    ];
    const value = (term: string) => publication.getByRole('definition').nth(terms.indexOf(term));
    await expect(publication.getByRole('term')).toHaveText(terms);
    await expect(value('Domínio')).not.toBeEmpty();
    await expect(value('Indexável')).toHaveText(/^(Sim|Não)$/);
    await expect(value('Status')).toHaveText('Ativo');
    await expect(value('Release')).not.toBeEmpty();
    await expect(value('Mudanças pendentes')).toHaveText(/^\d+/);
    await expect(value('Último build')).toHaveText(/^(—|Publicado|Falhou)/);
    await expect(value('G1')).toHaveText(/^(Registrado|Não registrado)$/);

    // Mesma ação da lista; o sucesso vai para o toast e a seção fica sem erro (#324).
    await page.waitForLoadState('networkidle');
    // Confirma num diálogo (#327): Esc e Cancelar não publicam e devolvem o foco ao botão.
    const publish = publication.getByRole('button', { name: 'Publicar agora exemplo-a' });
    const dialog = page.getByRole('alertdialog', { name: 'Publicar exemplo-a agora?' });
    await publish.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(publish).toBeFocused();
    await publish.click();
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(publish).toBeFocused();
    await expect(page.getByRole('status').filter({ hasText: 'enfileirado' })).toHaveCount(0);
    await publish.click();
    await dialog.getByRole('button', { name: 'Publicar' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Build de exemplo-a enfileirado.' }),
    ).toBeVisible();
    await expect(publish.locator('xpath=..').getByRole('alert')).toBeEmpty();
    expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
  },
);

/**
 * Site pausado gravado pelo domínio (#155): a tela não pausa site, e um site pausado no seed
 * mudaria a lista para os outros testes. Entra em `created` antes de gravar, para a limpeza.
 */
async function createPausedSite(siteId: string, reason: string): Promise<void> {
  created.push(siteId);
  const line = (await readFixture('exemplo-b')).find((l) => l.type === 'config');
  if (line?.type !== 'config') throw new Error('fixture sem config');
  const pool = createPool(getDatabaseUrl());
  try {
    await createDb(pool).transaction(async (tx) => {
      const result = await createSite(tx, SYSTEM_ACTOR, {
        ...line.data,
        siteId,
        name: `Site ${siteId}`,
        domains: [`${siteId}.example.com`],
      });
      if (!result.ok) throw new Error(JSON.stringify(result.issues));
      await pauseSite(tx, siteId, reason);
    });
  } finally {
    await pool.end();
  }
}

test('operação vê o site pausado com o motivo e sem Publicar agora', async ({ page }) => {
  const siteId = `e2e-pausado-${Date.now()}`;
  const reason =
    'render: Tema "padrao-editorial-receitas" não existe nesta release do site-builder';
  await createPausedSite(siteId, reason);

  await loginAs(page, 'operacao@orakel.local');
  await page.goto(`/sites/${siteId}`);
  const publication = siteSummary(page);
  await expect(publication.getByText('Pausado', { exact: true })).toBeVisible();
  // Motivo inteiro, sem corte: é o que a operação precisa para retomar o site.
  await expect(publication.getByText(reason, { exact: true })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('button', { name: /^Publicar agora/ })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
});

test('editor vê a página do site sem as ações', async ({ page }) => {
  await loginAs(page, 'editor@orakel.local');
  await page.getByRole('link', { name: 'Exemplo A — Guias' }).click();
  await expect(siteSummary(page).getByRole('term')).toHaveCount(7);
  // Cada aba mostra o mesmo que para a operação, só de leitura (#370).
  const noActions = async () => {
    for (const name of [/^Marcar/, /^Publicar agora/, 'Registrar G1', /^Salvar$/, 'Usar padrão']) {
      await expect(page.getByRole('button', { name })).toHaveCount(0);
    }
    await expect(page.locator('form')).toHaveCount(0);
  };
  const lifecycle = page.getByRole('tabpanel', { name: 'Ciclo de vida' });
  await expect(lifecycle.getByRole('listitem')).toHaveCount(4);
  await noActions();
  const g1 = await openTab(page, 'G1 (indexação)');
  await expect(
    g1.getByText('Registro que libera a indexação do site', { exact: false }),
  ).toBeVisible();
  await expect(g1.getByText(/^(Registrado por .+|G1 não registrado: .+)$/)).toBeVisible();
  await noActions();
  const buildWindow = await openTab(page, 'Janela de agrupamento');
  await expect(buildWindow.getByText(/^Janela efetiva: /)).toBeVisible();
  await noActions();
  await expect(page.getByRole('link', { name: 'Editar configuração' })).toHaveCount(0);
});

// Visão geral do site em Card e nos campos do Ecme (#246), com as ações da operação, em cada
// aba (#370), no tema claro.
test(`página do site sem violação do axe`, async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await loginAs(page, 'operacao@orakel.local');
  await page.goto('/sites/exemplo-a');
  await expect(siteSummary(page).getByRole('term')).toHaveCount(7);
  await expect(page.getByRole('tabpanel', { name: 'Ciclo de vida' })).toBeVisible();
  await expectNoViolations(page);

  // As ações da tela são todas `sm`, e a do cabeçalho, solid (#370). A grade resumo × abas por
  // largura fica em `DetailLayout.browser.test.tsx` (#460).
  const sm = /(^| )h-10( |$)/;
  const edit = page.getByRole('link', { name: 'Editar configuração' });
  await expect(edit).toHaveClass(sm);
  await expect(edit).toHaveClass(/bg-primary/);
  await expect(page.getByRole('button', { name: 'Publicar agora exemplo-a' })).toHaveClass(sm);

  const g1 = await openTab(page, 'G1 (indexação)');
  for (const button of await g1.locator('.card-footer').getByRole('button').all()) {
    await expect(button).toHaveClass(sm);
  }
  await expectNoViolations(page);
  // G1 e janela gerados do schema, em cartão com os botões no rodapé, sem barra fixa (#333).
  const windowSection = await openTab(page, 'Janela de agrupamento');
  const footer = windowSection.locator('.card-footer');
  await expect(footer.getByRole('button', { name: 'Salvar', exact: true })).toBeVisible();
  await expect(footer.getByRole('button', { name: 'Usar padrão' })).toBeVisible();
  for (const button of await footer.getByRole('button').all()) await expect(button).toHaveClass(sm);
  await expect(page.locator('.sticky')).toHaveCount(0);
  await page.waitForLoadState('networkidle');
  // O erro de campo do schema, validado no navegador (sem gravar nada).
  const windowInput = windowSection.getByLabel('Janela própria (segundos)');
  await windowInput.fill('');
  await footer.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(windowInput).toHaveAttribute('aria-invalid', 'true');

  await expectNoViolations(page);

  // Com a confirmação de "Publicar agora" aberta (#327); Cancelar não publica.
  await page.getByRole('button', { name: 'Publicar agora exemplo-a' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Publicar exemplo-a agora?' });
  await expect(dialog).toBeVisible();
  await expectNoViolations(page);
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toHaveCount(0);
});

// Mudanças pendentes no DataTable do template (#249, #365): o cadastro registra a configuração
// v1, e o site novo já tem uma pendência; o axe não acha violação no tema claro. A 1280 px sem
// rolagem horizontal, as linhas por célula e o tema escuro ficam em
// `PendingChangesTable.browser.test.tsx` (#460).
test('mudanças pendentes do site novo, sem violação do axe', async ({ page }) => {
  const siteId = `e2e-pendencias-${Date.now()}`;
  created.push(siteId);
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await loginAs(page, 'operacao@orakel.local');
  await newSite(page, siteId);
  await page.goto(`/sites/${siteId}/pendencias`);
  await expect(page.getByRole('heading', { name: 'Mudanças pendentes' })).toBeVisible();
  const table = page.getByRole('table', { name: 'Mudanças pendentes', exact: true });
  await expect(table.getByRole('columnheader')).toHaveText(['Origem', 'Item', 'Registrada em']);
  await expect(table.getByRole('link', { name: 'Configuração v1 (abrir)' })).toHaveAttribute(
    'href',
    `/sites/${siteId}/configuracao`,
  );
  await expect(page.getByRole('status').filter({ hasText: /resultados?$/ })).toHaveText(
    '1 resultado',
  );

  await expectNoViolations(page);
});

test('site inexistente responde 404', async ({ page }) => {
  await loginAs(page, 'operacao@orakel.local');
  expect((await page.goto('/sites/nao-existe'))?.status()).toBe(404);
});
