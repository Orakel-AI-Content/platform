import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Layout do site (#78, workspace#32) contra o ambiente local: título da aba com a área e o
// site, "não encontrado" de site e de item com o link certo e status 404, o carregamento
// entre áreas do mesmo site com o cabeçalho visível, a barra lateral de áreas (#171) e o
// seletor de site no topo dela (#172).

const OPERATOR = 'operacao@orakel.local';
const SITE = 'exemplo-a';
const SITE_NAME = 'Exemplo A — Guias';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag22aa'];

const AREAS = ['Visão geral', 'Conteúdos', 'Revisão', 'Mídia', 'Autores', 'Taxonomias', 'Menus'];

async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto('/sites');
  await page.getByRole('link', { name: email }).click();
  await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();
}

test('a aba mostra a área e, dentro de um site, o nome dele', async ({ page }) => {
  await loginAs(page, OPERATOR);
  await expect(page).toHaveTitle('Sites · Orakel Backoffice');

  await page.goto('/sites/novo');
  await expect(page).toHaveTitle('Cadastrar site · Orakel Backoffice');

  await page.goto(`/sites/${SITE}`);
  await expect(page).toHaveTitle(`${SITE_NAME} · Orakel Backoffice`);

  for (const [path, area] of [
    ['midia', 'Mídia'],
    ['conteudos', 'Conteúdos'],
    ['autores', 'Autores'],
    ['taxonomias', 'Taxonomias'],
    ['menus', 'Menus'],
    ['configuracao', 'Configuração do site'],
  ]) {
    await page.goto(`/sites/${SITE}/${path}`);
    await expect(page).toHaveTitle(`${area} · ${SITE_NAME} · Orakel Backoffice`);
  }
});

test('site inexistente leva a Sites; item inexistente leva ao site; os dois com 404', async ({
  page,
}) => {
  await loginAs(page, OPERATOR);

  const missingSite = await page.goto('/sites/inexistente/midia');
  expect(missingSite?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
  await expect(page.getByRole('banner')).toContainText(OPERATOR);
  await page.getByRole('link', { name: 'Ir para a lista de sites' }).click();
  await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();

  const missingContent = await page.goto(`/sites/${SITE}/conteudos/999999`);
  expect(missingContent?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
  await expect(page.getByRole('banner')).toContainText(OPERATOR);
  await page.getByRole('link', { name: `Ir para o site ${SITE}` }).click();
  await expect(page).toHaveURL(new RegExp(`/sites/${SITE}$`));
  await expect(page.getByRole('heading', { level: 1 })).toContainText(SITE_NAME);
});

test('entre áreas do mesmo site, o carregamento aparece com o cabeçalho visível', async ({
  page,
}) => {
  await loginAs(page, OPERATOR);
  await page.goto(`/sites/${SITE}`);
  await page.waitForLoadState('networkidle');

  // Segura a resposta da Mídia (não o prefetch) para o carregamento ficar visível.
  await page.route(
    (url) => url.pathname === `/sites/${SITE}/midia`,
    async (route) => {
      const headers = route.request().headers();
      if (headers['rsc'] === '1' && headers['next-router-prefetch'] === undefined) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      await route.continue();
    },
  );

  await page.getByRole('link', { name: 'Mídia', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Carregando' })).toBeVisible();
  await expect(page.getByRole('banner')).toContainText(OPERATOR);

  await expect(page).toHaveTitle(`Mídia · ${SITE_NAME} · Orakel Backoffice`);
  await expect(page.getByRole('status').filter({ hasText: 'Carregando' })).toHaveCount(0);
  await expect(page.getByRole('banner')).toContainText(OPERATOR);
});

test('a barra lateral lista as áreas, sem Textos institucionais para quem não edita', async ({
  page,
}) => {
  await loginAs(page, OPERATOR);
  await page.goto(`/sites/${SITE}`);
  const bar = page.getByRole('navigation', { name: 'Áreas do site' });
  await expect(bar.getByRole('link')).toHaveText(AREAS);
  // A página do site não repete as áreas; "Editar configuração" continua nela.
  await expect(page.getByRole('link', { name: 'Autores', exact: true })).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Editar configuração' })).toBeVisible();
});

test('com content.write, a barra também tem Textos institucionais', async ({ page }) => {
  await loginAs(page, 'editor@orakel.local');
  await page.goto(`/sites/${SITE}/midia`);
  await expect(
    page.getByRole('navigation', { name: 'Áreas do site' }).getByRole('link'),
  ).toHaveText([...AREAS, 'Textos institucionais']);
});

test('a área atual tem aria-current, também em telas de item, criar e editar', async ({ page }) => {
  await loginAs(page, 'editor@orakel.local');
  const bar = page.getByRole('navigation', { name: 'Áreas do site' });
  const current = bar.locator('[aria-current="page"]');

  for (const [path, area] of [
    ['', 'Visão geral'],
    ['/autores', 'Autores'],
    ['/autores/novo', 'Autores'],
    ['/conteudos/novo', 'Conteúdos'],
    ['/revisao', 'Revisão'],
    ['/configuracao', 'Visão geral'],
  ] as const) {
    await page.goto(`/sites/${SITE}${path}`);
    await expect(current).toHaveCount(1);
    await expect(current).toHaveText(area);
  }
});

test('a barra é navegável só com teclado', async ({ page }) => {
  await loginAs(page, OPERATOR);
  await page.goto(`/sites/${SITE}`);
  const taxonomies = page
    .getByRole('navigation', { name: 'Áreas do site' })
    .getByRole('link', { name: 'Taxonomias' });

  for (let step = 0; step < 40; step += 1) {
    if (await taxonomies.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expect(taxonomies).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(new RegExp(`/sites/${SITE}/taxonomias$`));
  await expect(taxonomies).toHaveAttribute('aria-current', 'page');
});

const switcher = (page: Page) => page.getByRole('button', { name: `${SITE_NAME}, trocar de site` });
const OTHER_SITE = 'Exemplo B — Receitas';

test('o seletor troca de site em 2 cliques, na mesma área; item leva à lista', async ({ page }) => {
  await loginAs(page, 'editor@orakel.local');

  await page.goto(`/sites/${SITE}/midia`);
  await switcher(page).click();
  await page.getByRole('menu').getByRole('menuitem', { name: OTHER_SITE }).click();
  await expect(page).toHaveURL(/\/sites\/exemplo-b\/midia$/);

  await page.goto(`/sites/${SITE}/autores/novo`);
  await switcher(page).click();
  await page.getByRole('menu').getByRole('menuitem', { name: OTHER_SITE }).click();
  await expect(page).toHaveURL(/\/sites\/exemplo-b\/autores$/);
});

test('o seletor lista os sites de quem pede, com o atual marcado', async ({ page }) => {
  await loginAs(page, 'editor@orakel.local');
  const menu = page.getByRole('menu');

  // Outros arquivos do E2E rodam em paralelo e cadastram e removem sites (o sites-list.spec
  // grava 18 no beforeAll), então a lista pode mudar entre a leitura da tabela e a do seletor.
  // As duas são relidas até concordarem, o que acontece assim que a outra rodada termina a
  // carga ou a limpeza.
  await expect
    .poll(
      async () => {
        await page.goto('/sites');
        const visible = await page
          .getByRole('table')
          .getByRole('row')
          .filter({ has: page.getByRole('cell') })
          .count();
        await page.goto(`/sites/${SITE}`);
        await switcher(page).click();
        await expect(menu).toBeVisible();
        const listed = await menu.getByRole('menuitem').count();
        return listed === visible;
      },
      { timeout: 30_000, intervals: [500] },
    )
    .toBe(true);
  await expect(menu.locator('[aria-current="true"]')).toHaveText(SITE_NAME);
});

test('o seletor abre, escolhe e fecha só com teclado; Esc devolve o foco ao botão', async ({
  page,
}) => {
  await loginAs(page, OPERATOR);
  await page.goto(`/sites/${SITE}/taxonomias`);
  await page.waitForLoadState('networkidle');
  const button = switcher(page);
  const menu = page.getByRole('menu');

  for (let step = 0; step < 40; step += 1) {
    if (await button.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expect(button).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(button).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(menu).toBeVisible();
  const other = menu.getByRole('menuitem', { name: OTHER_SITE });
  // Uma seta por site do menu, no máximo: com outros arquivos do E2E cadastrando sites em
  // paralelo, a lista pode ter mais de 20, e o Enter só vale com o foco no item certo.
  const items = await menu.getByRole('menuitem').count();
  for (let step = 0; step <= items; step += 1) {
    if (await other.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press('ArrowDown');
  }
  await expect(other).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/sites\/exemplo-b\/taxonomias$/);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`o seletor aberto sem violação do axe (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await loginAs(page, 'editor@orakel.local');
    await page.goto(`/sites/${SITE}/autores`);
    await page.waitForLoadState('networkidle');
    // Pelo teclado, como na vitrine do Dropdown: o primeiro item recebe o foco (`tabindex=0`).
    // Com mais sites do que cabem (outros arquivos do E2E cadastram em paralelo), o <ul> rola,
    // e o `scrollable-region-focusable` do axe pede um item focável dentro dele.
    await switcher(page).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu').getByRole('menuitem').first()).toBeFocused();
    // A transição de abertura (200 ms, no <ul>) mistura a cor do texto com o fundo enquanto a
    // opacidade sobe; o axe roda depois dela.
    await expect(page.locator('.dropdown-menu')).toHaveCSS('opacity', '1');

    const accessibility = await new AxeBuilder({ page })
      .withTags(WCAG)
      .include('.side-nav')
      .include('[role="menu"]')
      .exclude('[data-floating-ui-focus-guard]')
      .analyze();
    expect(accessibility.violations).toEqual([]);
  });
}

test('trilha nas telas de item: Sites › Site › Área › Item, sem link de volta solto', async ({
  page,
}) => {
  await loginAs(page, 'editor@orakel.local');
  const trail = page.getByRole('navigation', { name: 'Trilha de navegação' });
  const main = page.getByRole('main');
  const expectTrail = async (items: readonly string[]) => {
    await expect(trail.getByRole('listitem')).toHaveText(
      items.map((item, index) => (index === 0 ? item : `›${item}`)),
    );
    await expect(trail.getByRole('link')).toHaveCount(items.length - 1);
    await expect(trail.locator('[aria-current="page"]')).toHaveText(items.at(-1) ?? '');
    await expect(
      main.getByRole('link', { name: /^(Conteúdos|Autores|Taxonomias|Menus) de / }),
    ).toHaveCount(0);
    await expect(
      main.getByRole('link', { name: /Todas as versões|Versões do conteúdo/ }),
    ).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).not.toContainText(`(${SITE})`);
  };

  for (const [path, area, item] of [
    ['autores/novo', 'Autores', 'Criar autor'],
    ['taxonomias/novo', 'Taxonomias', 'Criar taxonomia'],
    ['menus/novo', 'Menus', 'Criar menu'],
    ['conteudos/novo', 'Conteúdos', 'Criar conteúdo'],
  ] as const) {
    await page.goto(`/sites/${SITE}/${path}`);
    await expectTrail(['Sites', SITE_NAME, area, item]);
  }

  // Editar um item existente: o último nível é o nome dele.
  await page.goto(`/sites/${SITE}/autores`);
  const firstAuthor = main.getByRole('table').getByRole('row').nth(1);
  const authorName = ((await firstAuthor.getByRole('cell').first().textContent()) ?? '').trim();
  await firstAuthor.getByRole('link', { name: `Editar ${authorName}` }).click();
  await expectTrail(['Sites', SITE_NAME, 'Autores', authorName]);

  // Conteúdo: versões, editar e uma versão.
  await page.goto(`/sites/${SITE}/conteudos`);
  await main
    .getByRole('table')
    .getByRole('link', { name: /\(versões\)/ })
    .first()
    .click();
  // Espera a tela de versões: lido antes, o h1 ainda seria o da lista de conteúdos.
  const versionsHeading = page.getByRole('heading', { level: 1, name: /^Versões de “.+”$/ });
  await expect(versionsHeading).toBeVisible();
  const heading = (await versionsHeading.textContent()) ?? '';
  const title = /“(.+)”/.exec(heading)?.[1] ?? '';
  await expectTrail(['Sites', SITE_NAME, 'Conteúdos', title]);
  const versionsPath = new URL(page.url()).pathname;

  await page.goto(`${versionsPath}/editar`);
  await expectTrail(['Sites', SITE_NAME, 'Conteúdos', title, 'Editar']);
  await expect(trail.getByRole('link', { name: title })).toHaveAttribute('href', versionsPath);

  await page.goto(`${versionsPath}/versoes/1`);
  await expectTrail(['Sites', SITE_NAME, 'Conteúdos', title, 'Versão 1']);
});

// Recolher a barra (#238): o toggle do header alterna 290px ↔ 80px; recolhida, os itens ficam
// só com o ícone, o nome no link e a dica no hover e no foco; o estado vale entre navegações
// pelo cliente e volta expandido ao recarregar.

const sideNavToggle = (page: Page) => page.getByRole('button', { name: 'Navegação lateral' });
const sideNavWidth = (page: Page) =>
  page.locator('#barra-lateral').evaluate((element) => element.getBoundingClientRect().width);

test('o toggle recolhe e expande a barra; recolhida, ícones com nome, dica e aria-current', async ({
  page,
}) => {
  await loginAs(page, 'editor@orakel.local');
  await page.goto(`/sites/${SITE}/autores`);
  await page.waitForLoadState('networkidle');
  const toggle = sideNavToggle(page);
  const bar = page.getByRole('navigation', { name: 'Áreas do site' });

  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(toggle).toHaveAttribute('aria-controls', 'barra-lateral');
  expect(await sideNavWidth(page)).toBe(290);

  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(() => sideNavWidth(page)).toBe(80);

  await expect(bar.getByRole('link')).toHaveText([...AREAS, 'Textos institucionais']);
  await expect(bar.getByRole('link', { name: 'Autores' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('link', { name: 'Orakel Backoffice' })).toHaveAttribute(
    'href',
    '/sites',
  );
  // O seletor vira as iniciais, com o mesmo nome e a dica com o nome do site.
  await expect(switcher(page).locator('[aria-hidden="true"]')).toHaveText('EA');
  await switcher(page).hover();
  await expect(page.getByRole('tooltip', { name: SITE_NAME })).toBeVisible();
  await switcher(page).click();
  await expect(page.getByRole('menu').getByRole('menuitem', { name: OTHER_SITE })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);

  await bar.getByRole('link', { name: 'Mídia' }).hover();
  await expect(page.getByRole('tooltip', { name: 'Mídia' })).toBeVisible();
  await page.mouse.move(800, 400);
  await expect(page.getByRole('tooltip')).toHaveCount(0);

  // A barra vem antes do header no DOM: o Tab parte da marca, o primeiro link dela.
  const taxonomias = bar.getByRole('link', { name: 'Taxonomias' });
  await page.getByRole('link', { name: 'Orakel Backoffice' }).focus();
  for (let step = 0; step < 40; step += 1) {
    if (await taxonomias.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expect(taxonomias).toBeFocused();
  // As dicas dos itens que o Tab deixou fecham com o blur; sob carga, ainda podem estar saindo.
  await expect(page.getByRole('tooltip', { name: 'Taxonomias' })).toBeVisible();
  await expect(page.getByRole('tooltip')).toHaveCount(1);

  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(() => sideNavWidth(page)).toBe(290);
});

test('recolhida, a barra continua assim entre áreas e volta expandida ao recarregar', async ({
  page,
}) => {
  await loginAs(page, OPERATOR);
  await page.goto(`/sites/${SITE}`);
  await page.waitForLoadState('networkidle');
  await sideNavToggle(page).click();
  await expect.poll(() => sideNavWidth(page)).toBe(80);

  await page
    .getByRole('navigation', { name: 'Áreas do site' })
    .getByRole('link', { name: 'Mídia' })
    .click();
  await expect(page).toHaveURL(new RegExp(`/sites/${SITE}/midia$`));
  await expect(sideNavToggle(page)).toHaveAttribute('aria-expanded', 'false');
  expect(await sideNavWidth(page)).toBe(80);

  await page.reload();
  await expect(sideNavToggle(page)).toHaveAttribute('aria-expanded', 'true');
  expect(await sideNavWidth(page)).toBe(290);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`a barra recolhida sem violação do axe (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await loginAs(page, 'editor@orakel.local');
    await page.goto(`/sites/${SITE}/autores`);
    await page.waitForLoadState('networkidle');
    await sideNavToggle(page).click();
    await expect.poll(() => sideNavWidth(page)).toBe(80);

    const accessibility = await new AxeBuilder({ page })
      .withTags(WCAG)
      .include('.side-nav')
      .include('.header')
      .analyze();
    expect(accessibility.violations).toEqual([]);
  });
}
