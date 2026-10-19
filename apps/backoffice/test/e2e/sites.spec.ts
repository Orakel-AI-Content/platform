import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

import { readFixture } from '../../src/bin/seed.ts';
import { createDb, createPool } from '../../src/db/client.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
import { pauseSite } from '../../src/domain/builds/site-state.ts';
import { createSite } from '../../src/domain/sites/sites.ts';
import { getDatabaseUrl } from '../../src/env.ts';
import { removeSites } from './cleanup.ts';

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

test('login pelo Access e registro de instâncias', async ({ page }) => {
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

test('operação cadastra e edita um site só com o teclado', async ({ page }) => {
  const siteId = `e2e-${Date.now()}`;
  created.push(siteId);
  await loginAs(page, 'operacao@orakel.local');
  // A ação fica no cabeçalho e, com a lista vazia, também no estado vazio (#87).
  await page.getByRole('link', { name: 'Cadastrar site' }).first().click();
  await expect(page.getByRole('heading', { name: 'Cadastrar site' })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);

  await typeInto(page, page.getByLabel('ID', { exact: true }), siteId);
  await typeInto(page, page.getByLabel('Nome', { exact: true }), 'Site do E2E');
  await typeInto(page, page.getByRole('textbox', { name: 'Domínios' }), `${siteId}.example.com`);
  // Tema (#163): escolhido no grupo, pelo nome legível, só com o teclado.
  await tabTo(page, page.getByRole('radio', { name: /Editorial claro/ }));
  await page.keyboard.press('Space');
  await expect(page.getByRole('radio', { name: /Editorial claro/ })).toBeChecked();
  await tabTo(page, page.getByRole('button', { name: 'Cadastrar site' }));
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
  await expect(page.getByLabel('ID', { exact: true })).toHaveAttribute('readonly', '');
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
  await tabTo(page, page.getByRole('button', { name: 'Salvar configuração' }));
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

test('preset fora dos recursos é recusado com a mensagem do domínio', async ({ page }) => {
  const siteId = `e2e-preset-${Date.now()}`;
  created.push(siteId);
  await loginAs(page, 'operacao@orakel.local');
  await page.goto('/sites/novo');
  await page.getByLabel('ID', { exact: true }).fill(siteId);
  await page.getByLabel('Nome', { exact: true }).fill('Preset forçado');
  await page.getByRole('textbox', { name: 'Domínios' }).fill(`${siteId}.example.com`);
  await page.getByRole('radio', { name: /Editorial claro/ }).check();
  // Valor forçado: uma opção que RESOURCES não lista.
  const home = page.getByLabel('Preset da página Home');
  await home.evaluate((select: HTMLSelectElement) => {
    select.add(new Option('inexistente', 'inexistente'));
  });
  await home.selectOption('inexistente');
  await page.getByRole('button', { name: 'Cadastrar site' }).click();

  // O erro fica no campo (descrição acessível), além do resumo de erros do formulário.
  await expect(page.getByLabel('Preset da página Home')).toHaveAccessibleDescription(
    /Preset "inexistente" de home não é suportado/,
  );
  await expect(home).toHaveAttribute('aria-invalid', 'true');
  await expect(home).toBeFocused();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Não foi possível salvar' }),
  ).toBeVisible();
  // A mensagem do FormItem (#245) entra com transição de opacidade, que mistura a cor do texto
  // com o fundo; o axe roda depois dela.
  await expect(page.locator('.form-explain')).toHaveCSS('opacity', '1');
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
});

// Formulário no visual do Ecme (#245): cadastro e configuração sem violação do axe nos dois
// temas, com as seções em Card e os campos do FormItem.
for (const colorScheme of ['light', 'dark'] as const) {
  test(`cadastro e configuração sem violação do axe (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await loginAs(page, 'operacao@orakel.local');

    for (const [path, heading] of [
      ['/sites/novo', 'Cadastrar site'],
      ['/sites/exemplo-a/configuracao', 'Identidade'],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations, path).toEqual(
        [],
      );
    }

    // Remover recurso confirma num diálogo (#327), sem violação com ele aberto; Cancelar não
    // remove e devolve o foco, "Remover" tira a linha. Nada é salvo.
    await page.waitForLoadState('networkidle');
    const flags = page.getByRole('group', { name: 'Recursos ligados' });
    const names = flags.getByLabel(/^Nome do recurso/);
    const count = await names.count();
    await flags.getByRole('button', { name: 'Adicionar recurso' }).click();
    await expect(names).toHaveCount(count + 1);
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
}

test('editor não cadastra nem edita a configuração', async ({ page }) => {
  await loginAs(page, 'editor@orakel.local');
  await expect(page.getByRole('link', { name: 'Cadastrar site' })).toHaveCount(0);
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

// Página do site (#30): ciclo de vida, G1 e janela de agrupamento.

async function newSite(page: Page, siteId: string): Promise<void> {
  await page.goto('/sites/novo');
  await page.getByLabel('ID', { exact: true }).fill(siteId);
  await page.getByLabel('Nome', { exact: true }).fill(`Site ${siteId}`);
  await page.getByRole('textbox', { name: 'Domínios' }).fill(`${siteId}.example.com`);
  await page.getByRole('radio', { name: /Editorial claro/ }).check();
  await page.getByRole('button', { name: 'Cadastrar site' }).click();
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
  const steps = page.getByRole('region', { name: 'Ciclo de vida' }).getByRole('list');
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
    await page.getByLabel('Indexável').check();
    await page.getByRole('button', { name: 'Salvar configuração' }).click();
  };
  await indexar();
  await expect(page.getByRole('checkbox', { name: 'Indexável' })).toHaveAccessibleDescription(
    /só pode ficar indexável depois do G1 registrado/,
  );
  await page.goto(`/sites/${siteId}`);
  await page.getByLabel('Observação do G1').fill('Políticas publicadas');
  await page.getByRole('button', { name: 'Registrar G1' }).click();
  await expect(
    page.getByText(/Registrado por operacao@orakel\.local em .* — Políticas publicadas/),
  ).toBeVisible();
  await indexar();
  await expect(status(page, 'versão 2')).toBeVisible();

  // Janela própria e volta à padrão; valor inválido dá erro no Alert junto da ação (#324).
  await page.goto(`/sites/${siteId}`);
  const windowSection = page.getByRole('region', { name: 'Janela de agrupamento' });
  await page.getByLabel('Janela própria (segundos)').fill('');
  await page.getByRole('button', { name: 'Salvar janela' }).click();
  await expect(windowSection.getByRole('alert')).toHaveText(
    'Informe um número inteiro de segundos, 0 ou mais.',
  );
  await page.getByLabel('Janela própria (segundos)').fill('30');
  await page.getByRole('button', { name: 'Salvar janela' }).click();
  await expect(status(page, 'Janela de 30 s salva.')).toBeVisible();
  await expect(page.getByText('Janela efetiva: 30 s, própria')).toBeVisible();
  await expect(windowSection.getByRole('alert')).toBeEmpty();
  await page.getByRole('button', { name: 'Usar padrão' }).click();
  await expect(page.getByText(/Janela efetiva: \d+ s( \(.+\))?, padrão/)).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);

  await page.goto('/sites');
  await expect(
    page.getByRole('row').filter({ hasText: siteId }).getByText('Zona ativa', { exact: true }),
  ).toBeVisible();
});

test('operação vê a publicação do site e o publica pela página', async ({ page }) => {
  await loginAs(page, 'operacao@orakel.local');
  await page.getByRole('link', { name: 'Exemplo A — Guias' }).click();
  const publication = page.getByRole('region', { name: 'Publicação' });
  const value = (term: string) =>
    publication
      .getByRole('definition')
      .nth(['Estado', 'Release', 'Mudanças pendentes', 'Último build'].indexOf(term));
  await expect(publication.getByRole('term')).toHaveText([
    'Estado',
    'Release',
    'Mudanças pendentes',
    'Último build',
  ]);
  await expect(value('Estado')).toHaveText('Ativo');
  await expect(value('Release')).not.toBeEmpty();
  await expect(value('Mudanças pendentes')).toHaveText(/^\d+/);
  await expect(value('Último build')).toHaveText(/^(—|Publicado|Falhou)/);

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
  await expect(publication.getByRole('alert')).toBeEmpty();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
});

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
  const publication = page.getByRole('region', { name: 'Publicação' });
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
  await expect(page.getByRole('heading', { name: 'Ciclo de vida' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Publicação' })).toBeVisible();
  for (const name of [
    /^Marcar/,
    /^Publicar agora/,
    'Registrar G1',
    'Salvar janela',
    'Usar padrão',
  ]) {
    await expect(page.getByRole('button', { name })).toHaveCount(0);
  }
  await expect(page.getByRole('link', { name: 'Editar configuração' })).toHaveCount(0);
});

// Visão geral do site em Card e nos campos do Ecme (#246), com as ações da operação, nos dois
// temas.
for (const colorScheme of ['light', 'dark'] as const) {
  test(`página do site sem violação do axe (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await loginAs(page, 'operacao@orakel.local');
    await page.goto('/sites/exemplo-a');
    for (const name of ['Ciclo de vida', 'Publicação', 'G1 (indexação)', 'Janela de agrupamento']) {
      await expect(
        page.getByRole('region', { name }).getByRole('heading', { level: 2, name }),
      ).toBeVisible();
    }
    await expect(page.getByLabel('Janela própria (segundos)')).toBeVisible();
    await page.waitForLoadState('networkidle');
    // O erro de uma ação no Alert do Ecme, validado no navegador (sem gravar nada).
    await page.getByLabel('Janela própria (segundos)').fill('');
    await page.getByRole('button', { name: 'Salvar janela' }).click();
    await expect(
      page.getByRole('region', { name: 'Janela de agrupamento' }).getByRole('alert'),
    ).not.toBeEmpty();

    await expectNoViolations(page);

    // Com a confirmação de "Publicar agora" aberta (#327); Cancelar não publica.
    await page.getByRole('button', { name: 'Publicar agora exemplo-a' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Publicar exemplo-a agora?' });
    await expect(dialog).toBeVisible();
    await expectNoViolations(page);
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toHaveCount(0);
  });
}

// Mudanças pendentes na Table do Ecme (#249), nos dois temas. O cadastro registra a
// configuração v1: o site novo já tem uma pendência.
for (const colorScheme of ['light', 'dark'] as const) {
  test(`mudanças pendentes sem violação do axe (${colorScheme})`, async ({ page }) => {
    const siteId = `e2e-pendencias-${colorScheme}-${Date.now()}`;
    created.push(siteId);
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await loginAs(page, 'operacao@orakel.local');
    await newSite(page, siteId);
    await page.goto(`/sites/${siteId}/pendencias`);
    await expect(page.getByRole('heading', { name: 'Mudanças pendentes' })).toBeVisible();
    const table = page.getByRole('table', { name: '1 mudança pendente' });
    await expect(table.getByRole('columnheader')).toHaveText(['Origem', 'Item', 'Registrada em']);
    await expect(table.getByRole('link', { name: 'Configuração v1' })).toHaveAttribute(
      'href',
      `/sites/${siteId}/configuracao`,
    );

    await expectNoViolations(page);
  });
}

test('site inexistente responde 404', async ({ page }) => {
  await loginAs(page, 'operacao@orakel.local');
  expect((await page.goto('/sites/nao-existe'))?.status()).toBe(404);
});
