import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

// Vitrine dos componentes do Ecme (#205; workspace#45): cada componente portado auditado com
// axe e teclado nos dois temas, renderizado no servidor sem aviso de hidratação. Com movimento
// reduzido, o MotionConfig do layout desliga as animações de transform do `motion`.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag22aa'];

/**
 * Auditoria do axe na página. Os "focus guards" do floating-ui (#210: Dropdown; também o
 * Tooltip e o DataTable) ficam de fora: são <span tabindex="0" aria-hidden="true"> invisíveis que
 * o FloatingPortal e o FloatingFocusManager criam para manter a ordem do Tab com o menu no fim do
 * <body>, e que repassam o foco na hora. O axe os acusa (`aria-hidden-focus`); desligá-los faria
 * o Tab sair da página a partir do menu (decisão no escalonamento da #210).
 */
const audit = (page: Page) =>
  new AxeBuilder({ page }).withTags(WCAG).exclude('[data-floating-ui-focus-guard]').analyze();
const SHOWCASE = '/teste-de-componentes';

async function login(page: Page): Promise<void> {
  await page.goto('/sites');
  await page.getByRole('link', { name: 'editor@orakel.local' }).click();
  await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();
}

/** Erros e avisos de hidratação (em produção, os erros minificados #418, #423 e #425). */
function hydrationMessages(page: Page): string[] {
  const messages: string[] = [];
  page.on('console', (message) => {
    if (/hydrat|#418|#423|#425/i.test(message.text())) messages.push(message.text());
  });
  page.on('pageerror', (error) => messages.push(error.message));
  return messages;
}

/** Leva o foco até o controle só com Tab (no máximo 150 passos: a vitrine cresce a cada Task). */
async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let step = 0; step < 150; step += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('O controle não recebeu o foco pelo teclado');
}

const section = (page: Page, name: string) => page.getByRole('region', { name });

for (const colorScheme of ['light', 'dark'] as const) {
  test(`vitrine sem violações do axe, com foco de 2px e alvos de 24 px (${colorScheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await login(page);
    const hydration = hydrationMessages(page);
    await page.goto(SHOWCASE);
    await expect(page.getByRole('heading', { name: 'Teste de componentes' })).toBeVisible();
    await page.waitForLoadState('networkidle');

    const accessibility = await audit(page);
    expect(accessibility.violations).toEqual([]);

    const buttons = section(page, 'Button').getByRole('button');
    expect(await buttons.count()).toBeGreaterThanOrEqual(8);
    for (const button of await buttons.all()) {
      const box = await button.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(24);
      expect(box?.height).toBeGreaterThanOrEqual(24);
    }

    // Foco do teclado: o contorno --ring de 2px da regra global, também no Button do Ecme.
    const ring = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--ring)';
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });
    for (const name of ['Solid', 'Default', 'Só ícone', 'Carregando']) {
      const button = page.getByRole('button', { name });
      await tabTo(page, button);
      expect(
        await button.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            color: style.outlineColor,
            style: style.outlineStyle,
            width: style.outlineWidth,
          };
        }),
      ).toEqual({ color: ring, style: 'solid', width: '2px' });
    }

    expect(hydration).toEqual([]);
  });
}

test('a vitrine vem renderizada do servidor', async ({ page }) => {
  await login(page);
  const response = await page.request.get(SHOWCASE);
  expect(response.status()).toBe(200);
  const html = await response.text();
  for (const text of [
    'Teste de componentes',
    'Solid',
    'Carregando exemplo',
    'Painel animado',
    'Resumo',
    'https://',
    'O slug já está em uso',
    'Destaque na capa',
    'Copiar link',
    'Escolha a categoria',
    'Guia de jardinagem',
    'Nome, domínio e idioma do site.',
  ]) {
    expect(html).toContain(text);
  }
});

test('Button aciona com Enter e com Espaço; desabilitado fica fora do Tab', async ({ page }) => {
  await login(page);
  await page.goto(SHOWCASE);
  await page.waitForLoadState('networkidle');
  const status = section(page, 'Button').getByRole('status');
  const solid = page.getByRole('button', { name: 'Solid' });

  await tabTo(page, solid);
  await page.keyboard.press('Enter');
  await expect(status).toHaveText('Solid acionado 1 vez(es).');
  await page.keyboard.press('Space');
  await expect(status).toHaveText('Solid acionado 2 vez(es).');

  await expect(page.getByRole('button', { name: 'Desabilitado' })).toBeDisabled();
  const loading = page.getByRole('button', { name: 'Carregando' });
  await expect(loading).toHaveAttribute('aria-busy', 'true');
  await expect(loading).toHaveAttribute('aria-disabled', 'true');

  // Do "Default" em diante, o Tab pula o desabilitado: o próximo é o "Extra pequeno".
  await tabTo(page, page.getByRole('button', { name: 'Carregando' }));
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Extra pequeno' })).toBeFocused();
});

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`movimento: o motion ${reducedMotion === 'reduce' ? 'não anima' : 'anima'} com reducedMotion ${reducedMotion}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await login(page);
    await page.goto(SHOWCASE);
    const panel = page.locator('[data-vitrine-movimento]');
    await expect(panel).toBeVisible();
    await page.waitForLoadState('networkidle');

    // Logo após a hidratação, a animação de 3 s ainda estaria no meio do caminho.
    const offset = await panel.evaluate(
      (element) => new DOMMatrix(getComputedStyle(element).transform).m41,
    );
    if (reducedMotion === 'reduce') expect(offset).toBe(0);
    else expect(offset).toBeLessThan(0);
  });
}

test('Loading anuncia o carregamento e o Skeleton fica fora da árvore acessível', async ({
  page,
}) => {
  await login(page);
  await page.goto(SHOWCASE);
  const loading = section(page, 'Carregamento');

  // Default e cover: os dois anunciam "Carregando…" em role="status".
  await expect(loading.getByRole('status')).toHaveText(['Carregando…', 'Carregando…']);
  await expect(loading.locator('[aria-busy="true"]')).toContainText(
    'Lista por baixo da sobreposição.',
  );

  const skeletons = page.locator('[data-vitrine-skeletons] .skeleton');
  expect(await skeletons.count()).toBeGreaterThanOrEqual(6);
  for (const skeleton of await skeletons.all()) {
    await expect(skeleton).toHaveAttribute('aria-hidden', 'true');
  }
  const tree = await page.locator('[data-vitrine-skeletons]').ariaSnapshot();
  expect(tree.trim()).toBe('');
});

test('StickyFooter fica visível ao rolar a vitrine', async ({ page }) => {
  await login(page);
  await page.goto(SHOWCASE);
  await page.waitForLoadState('networkidle');
  const save = section(page, 'Rodapé fixo').getByRole('button', { name: 'Salvar' });

  // No meio da área longa, o fim da seção está abaixo da janela: o rodapé gruda embaixo.
  await page.locator('[data-vitrine-rolagem]').evaluate((element) => {
    element.scrollIntoView({ block: 'center' });
  });
  await expect(save).toBeInViewport();
  const viewport = page.viewportSize()!;
  const box = await save.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  // A página continua onde a pessoa deixou: o rodapé não a rola sozinho até o fim.
  const scrolled = await page.evaluate(() => window.scrollY);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
});

// Input, InputGroup e Form (#207): rótulo e mensagem de erro ligados ao campo pelo FormItem.

/** Contorno de foco de um campo: o --ring de 2px da regra global, como no Button. */
async function focusOutline(target: Locator) {
  return target.evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: style.outlineWidth };
  });
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`Input, textarea e InputGroup na vitrine, focáveis por Tab com contorno de 2px (${colorScheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await login(page);
    await page.goto(SHOWCASE);
    await page.waitForLoadState('networkidle');

    const inputs = page.getByRole('region', { name: 'Input', exact: true });
    await expect(inputs.getByLabel('Título')).toHaveAttribute('type', 'text');
    await expect(inputs.getByLabel('Resumo')).toHaveJSProperty('tagName', 'TEXTAREA');
    await expect(inputs.getByLabel('Desabilitado')).toBeDisabled();

    const group = section(page, 'InputGroup');
    await expect(group.locator('.input-group').first()).toHaveText('https://.com.br');
    await expect(group.getByLabel('Domínio')).toBeVisible();

    for (const field of [
      inputs.getByLabel('Título'),
      inputs.getByLabel('Resumo'),
      group.getByLabel('Domínio'),
    ]) {
      await tabTo(page, field);
      expect(await focusOutline(field)).toEqual({ style: 'solid', width: '2px' });
    }
  });
}

test('FormItem liga rótulo e mensagem de erro ao campo, com aria-invalid', async ({ page }) => {
  await login(page);
  await page.goto(SHOWCASE);
  await page.waitForLoadState('networkidle');
  const form = section(page, 'Form');

  const slug = form.getByLabel('Slug');
  await expect(slug).toHaveAttribute('aria-invalid', 'true');
  await expect(slug).toHaveAccessibleDescription('O slug já está em uso');

  const email = form.getByLabel('E-mail');
  await expect(email).not.toHaveAttribute('aria-invalid');
  await expect(email).toHaveAccessibleDescription('');

  await form.getByRole('button', { name: 'Validar e-mail' }).click();
  await expect(email).toHaveAttribute('aria-invalid', 'true');
  await expect(email).toHaveAccessibleDescription('Informe um e-mail válido');

  // Com o erro na tela, a vitrine continua sem violação do axe (depois da transição, que
  // mistura a cor com o fundo enquanto a opacidade sobe).
  await expect(form.getByText('Informe um e-mail válido')).toHaveCSS('opacity', '1');
  const accessibility = await audit(page);
  expect(accessibility.violations).toEqual([]);

  await form.getByRole('button', { name: 'Limpar validação' }).click();
  await expect(email).not.toHaveAttribute('aria-invalid');
  await expect(form.getByText('Informe um e-mail válido')).toHaveCount(0);
});

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`mensagem de erro do FormItem ${reducedMotion === 'reduce' ? 'aparece sem' : 'aparece com'} transição com reducedMotion ${reducedMotion}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await login(page);
    await page.goto(SHOWCASE);
    await page.waitForLoadState('networkidle');

    // A opacidade da mensagem a cada quadro, do momento em que ela entra no DOM até 400 ms
    // depois (a transição do Ecme dura 150 ms). Valores intermediários são a animação.
    const samples = await page.evaluate(
      () =>
        new Promise<number[]>((resolve) => {
          const region = document.querySelector('[aria-labelledby="vitrine-form"]')!;
          const values: number[] = [];
          const observer = new MutationObserver(() => {
            const message = [...region.querySelectorAll('.form-explain')].find(
              (element) => element.textContent === 'Informe um e-mail válido',
            );
            if (!message) return;
            observer.disconnect();
            const start = performance.now();
            const sample = () => {
              values.push(Number(getComputedStyle(message).opacity));
              if (performance.now() - start < 400) requestAnimationFrame(sample);
              else resolve(values);
            };
            sample();
          });
          observer.observe(region, { childList: true, subtree: true });
          const toggle = [...region.querySelectorAll('button')].find(
            (button) => button.textContent === 'Validar e-mail',
          )!;
          toggle.click();
        }),
    );

    const intermediate = samples.filter((value) => value > 0 && value < 1);
    expect(samples.at(-1)).toBe(1);
    if (reducedMotion === 'reduce') expect(intermediate).toEqual([]);
    else expect(intermediate.length).toBeGreaterThan(0);
  });
}

// Checkbox e Select (#208): estado do Checkbox para o leitor de tela e o Select do react-select
// operado só pelo teclado, com o rótulo do FormItem.

test('Checkbox e Checkbox.Group alternam com Espaço e expõem o estado', async ({ page }) => {
  await login(page);
  await page.goto(SHOWCASE);
  await page.waitForLoadState('networkidle');
  const checkboxes = section(page, 'Checkbox');

  const destaque = checkboxes.getByRole('checkbox', { name: 'Destaque na capa' });
  await expect(destaque).not.toBeChecked();
  await destaque.focus();
  await page.keyboard.press('Space');
  await expect(destaque).toBeChecked();
  await page.keyboard.press('Space');
  await expect(destaque).not.toBeChecked();

  await expect(checkboxes.getByRole('checkbox', { name: 'Publicado' })).toBeChecked();
  // `indeterminate` nativo: o leitor de tela anuncia "misto".
  await expect(checkboxes.getByRole('checkbox', { name: 'Todas as seções' })).toBeChecked({
    indeterminate: true,
  });
  await expect(checkboxes.getByRole('checkbox', { name: 'Arquivado' })).toBeDisabled();

  const formatos = checkboxes.getByRole('group', { name: 'Formatos' });
  const status = checkboxes.getByRole('status');
  await expect(status).toHaveText('Formatos escolhidos: texto.');
  await formatos.getByRole('checkbox', { name: 'Vídeo' }).focus();
  await page.keyboard.press('Space');
  await expect(formatos.getByRole('checkbox', { name: 'Vídeo' })).toBeChecked();
  await expect(status).toHaveText('Formatos escolhidos: texto, video.');
  await page.keyboard.press('Shift+Tab');
  await expect(formatos.getByRole('checkbox', { name: 'Texto' })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(status).toHaveText('Formatos escolhidos: video.');
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`Select pelo teclado: rótulo, setas, Enter e Esc, sem violação do axe com o menu aberto (${colorScheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await login(page);
    const hydration = hydrationMessages(page);
    await page.goto(SHOWCASE);
    await page.waitForLoadState('networkidle');
    const selects = section(page, 'Select');

    const categoria = selects.getByLabel('Categoria', { exact: true });
    await expect(categoria).toHaveAttribute('role', 'combobox');
    await categoria.focus();
    await page.keyboard.press('ArrowDown');
    await expect(categoria).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('ArrowDown');

    // A opção em foco tem fundo próprio, diferente das outras.
    const options = selects.locator('.select-option');
    await expect(options).toHaveCount(4);
    const focused = selects.locator('.select-option-focused');
    await expect(focused).toHaveText('Guias');
    const background = (locator: Locator) =>
      locator.evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(await background(focused)).not.toBe(await background(options.first()));

    const accessibility = await audit(page);
    expect(accessibility.violations).toEqual([]);

    await page.keyboard.press('Enter');
    await expect(selects.locator('.select-single-value').first()).toHaveText('Guias');
    await expect(categoria).toBeFocused();

    await page.keyboard.press('ArrowDown');
    await expect(categoria).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(categoria).toHaveAttribute('aria-expanded', 'false');
    await expect(selects.locator('.select-menu')).toHaveCount(0);

    expect(hydration).toEqual([]);
  });
}

test('Select em FormItem inválido, async e creatable', async ({ page }) => {
  await login(page);
  await page.goto(SHOWCASE);
  await page.waitForLoadState('networkidle');
  const selects = section(page, 'Select');

  const secao = selects.getByLabel('Seção');
  await expect(secao).toHaveAttribute('aria-invalid', 'true');
  const errorId = await secao.getAttribute('aria-errormessage');
  await expect(page.locator(`[id="${errorId}"]`)).toHaveText('Escolha uma seção');

  const site = selects.getByLabel('Site');
  await site.focus();
  await page.keyboard.type('rece');
  await expect(selects.locator('.select-option')).toHaveText(['Receitas da casa']);
  await page.keyboard.press('Enter');
  await expect(
    selects.locator('.select-single-value', { hasText: 'Receitas da casa' }),
  ).toBeVisible();

  const palavra = selects.getByLabel('Palavra-chave');
  await palavra.focus();
  await page.keyboard.type('Podcasts');
  await expect(selects.locator('.select-option-focused')).toHaveText('Criar "Podcasts"');
  await page.keyboard.press('Enter');
  await expect(selects.locator('.select-single-value', { hasText: 'Podcasts' })).toBeVisible();
});

// Dropdown (#210) sobre o floating-ui: gatilho no Tab, abertura por Enter, Espaço e seta, setas e
// typeahead nos itens, Esc e escolha devolvendo o foco ao gatilho, e submenu pelas setas.

/** Põe o foco logo antes da seção do Dropdown, para o próximo Tab chegar ao gatilho. */
async function focusBeforeDropdown(page: Page): Promise<void> {
  await page.locator('#vitrine-dropdown').evaluate((heading) => {
    heading.setAttribute('tabindex', '-1');
    (heading as HTMLElement).focus();
  });
}

const activeText = (page: Page) =>
  page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');

for (const key of ['Enter', 'Space', 'ArrowDown'] as const) {
  test(`Dropdown abre com ${key}, Esc fecha e devolve o foco ao gatilho`, async ({ page }) => {
    await login(page);
    await page.goto(SHOWCASE);
    await page.waitForLoadState('networkidle');
    const toggle = page.getByRole('button', { name: 'Ações do artigo' });

    await focusBeforeDropdown(page);
    await page.keyboard.press('Tab');
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute('aria-haspopup', 'menu');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await page.keyboard.press(key);
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem', { name: 'Editar' })).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(toggle).toHaveAttribute('aria-controls', (await menu.getAttribute('id'))!);

    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
}

test('Dropdown: setas pulam o desabilitado, typeahead e Enter escolhe e devolve o foco', async ({
  page,
}) => {
  await login(page);
  const hydration = hydrationMessages(page);
  await page.goto(SHOWCASE);
  await page.waitForLoadState('networkidle');
  const toggle = page.getByRole('button', { name: 'Ações do artigo' });
  const status = section(page, 'Dropdown').getByRole('status');

  await toggle.focus();
  await page.keyboard.press('ArrowDown');
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem')).toHaveText([
    'Editar',
    'Duplicar',
    'Publicar',
    'Exportar',
  ]);
  await expect(menu.getByRole('separator')).toHaveCount(1);
  await expect(menu.getByRole('menuitem', { name: 'Duplicar' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await expect.poll(() => activeText(page)).toBe('Editar');

  await page.keyboard.press('ArrowDown');
  await expect.poll(() => activeText(page)).toBe('Publicar');
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => activeText(page)).toBe('Editar');
  await page.keyboard.press('p');
  await expect.poll(() => activeText(page)).toBe('Publicar');

  await page.keyboard.press('Enter');
  await expect(status).toHaveText('Ação: publicar.');
  await expect(menu).toHaveCount(0);
  await expect(toggle).toBeFocused();

  // O gatilho desabilitado fica fora do Tab.
  const disabled = page.getByRole('button', { name: 'Indisponível' });
  await expect(disabled).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Tab');
  await expect(disabled).not.toBeFocused();

  expect(hydration).toEqual([]);
});

test('Dropdown: submenu abre com ArrowRight e fecha com ArrowLeft, devolvendo o foco', async ({
  page,
}) => {
  await login(page);
  await page.goto(SHOWCASE);
  await page.waitForLoadState('networkidle');
  const toggle = page.getByRole('button', { name: 'Ações do artigo' });
  const status = section(page, 'Dropdown').getByRole('status');

  await toggle.focus();
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => activeText(page)).toBe('Editar');
  // As setas não dão a volta na lista (como no Ecme): Editar → Publicar → Exportar.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => activeText(page)).toBe('Exportar');
  const exportar = page.getByRole('menuitem', { name: 'Exportar' });
  await expect(exportar).toHaveAttribute('aria-haspopup', 'menu');

  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('menuitem', { name: 'PDF' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'PDF' })).toBeFocused();
  await expect(exportar).toHaveAttribute('aria-expanded', 'true');

  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('menuitem', { name: 'PDF' })).toHaveCount(0);
  await expect(exportar).toBeFocused();

  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('menuitem', { name: 'PDF' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(status).toHaveText('Ação: exportar CSV.');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(toggle).toBeFocused();
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`Dropdown aberto, com submenu, sem violação do axe (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await login(page);
    await page.goto(SHOWCASE);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Ações do artigo' }).focus();
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => activeText(page)).toBe('Editar');
    // A transição de abertura (200 ms, no <ul>) mistura a cor do texto com o fundo enquanto a
    // opacidade sobe; o axe roda depois dela.
    await expect(page.locator('.dropdown-menu')).toHaveCSS('opacity', '1');
    let accessibility = await audit(page);
    expect(accessibility.violations).toEqual([]);

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => activeText(page)).toBe('Exportar');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('menuitem', { name: 'PDF' })).toBeFocused();
    await expect(page.locator('.dropdown-menu').last()).toHaveCSS('opacity', '1');
    // Com o submenu aberto, o floating-ui põe um <span aria-owns> no menu pai para o leitor de
    // tela tratar o submenu (em outro portal) como filho dele; o axe acusa
    // `aria-required-children` no `role="menu"`. Só nesta auditoria a regra fica desligada
    // (decisão no segundo escalonamento da #210); com o menu de topo aberto, ela vale.
    accessibility = await new AxeBuilder({ page })
      .withTags(WCAG)
      .exclude('[data-floating-ui-focus-guard]')
      .disableRules(['aria-required-children'])
      .analyze();
    expect(accessibility.violations).toEqual([]);
  });
}

// Dialog, Drawer e ConfirmDialog (#209) sobre o react-modal: foco preso, Esc fecha e o foco volta
// ao botão que abriu; o título nomeia o diálogo; o contêiner da app fica inerte enquanto ele está
// aberto, e nenhuma animação roda com movimento reduzido.

const DIALOGS = [
  { opener: 'Abrir Dialog', role: 'dialog', name: 'Editar autor' },
  { opener: 'Abrir Drawer', role: 'dialog', name: 'Filtros' },
  { opener: 'Abrir ConfirmDialog', role: 'alertdialog', name: 'Limpar os filtros?' },
] as const;

const appRoot = (page: Page) => page.locator('#app-root');

/** Mensagens do react-modal sem o appElement registrado. */
function appElementWarnings(page: Page): string[] {
  const messages: string[] = [];
  page.on('console', (message) => {
    if (/App element is not defined/i.test(message.text())) messages.push(message.text());
  });
  return messages;
}

for (const { opener, role, name } of DIALOGS) {
  test(`${name}: foco preso, página inerte, Esc fecha e o foco volta a "${opener}"`, async ({
    page,
  }) => {
    await login(page);
    const warnings = appElementWarnings(page);
    await page.goto(SHOWCASE);
    await page.waitForLoadState('networkidle');

    const button = section(page, 'Dialog').getByRole('button', { name: opener });
    await button.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole(role, { name });
    // O elemento do react-modal não tem caixa própria no Drawer (o conteúdo é absoluto dentro do
    // overlay, como no Ecme): a visibilidade é a do título.
    await expect(dialog.getByRole('heading', { name })).toBeVisible();
    await expect(appRoot(page)).toHaveAttribute('inert', '');
    await expect(appRoot(page)).toHaveAttribute('aria-hidden', 'true');

    // Tab e Shift+Tab repetidos não saem do diálogo.
    for (const key of ['Tab', 'Shift+Tab'] as const) {
      for (let step = 0; step < 6; step += 1) {
        await page.keyboard.press(key);
        expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(
          true,
        );
      }
    }

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(button).toBeFocused();
    await expect(appRoot(page)).not.toHaveAttribute('inert');
    expect(warnings).toEqual([]);
  });
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`Dialog, Drawer e ConfirmDialog abertos sem violação do axe (${colorScheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await login(page);
    const hydration = hydrationMessages(page);
    await page.goto(SHOWCASE);
    await page.waitForLoadState('networkidle');

    for (const { opener, role, name } of DIALOGS) {
      await section(page, 'Dialog').getByRole('button', { name: opener }).click();
      const dialog = page.getByRole(role, { name });
      await expect(dialog.getByRole('heading', { name })).toBeVisible();
      const accessibility = await audit(page);
      expect(accessibility.violations, name).toEqual([]);
      // O primeiro Tab dentro do diálogo leva ao botão Fechar, com nome e contorno de 2px.
      await page.keyboard.press('Tab');
      const close = dialog.getByRole('button', { name: 'Fechar' });
      await expect(close).toBeFocused();
      expect(
        await close.evaluate((element) => {
          const style = getComputedStyle(element);
          return { style: style.outlineStyle, width: style.outlineWidth };
        }),
      ).toEqual({ style: 'solid', width: '2px' });
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    }

    expect(hydration).toEqual([]);
  });
}

test('ConfirmDialog sobre o Drawer: fechar só a confirmação mantém a página inerte', async ({
  page,
}) => {
  await login(page);
  await page.goto(SHOWCASE);
  await page.waitForLoadState('networkidle');

  await section(page, 'Dialog').getByRole('button', { name: 'Abrir Drawer' }).click();
  const drawer = page.getByRole('dialog', { name: 'Filtros' });
  const clear = drawer.getByRole('button', { name: 'Limpar filtros' });
  await clear.click();
  const confirm = page.getByRole('alertdialog', { name: 'Limpar os filtros?' });
  await expect(confirm.getByRole('heading', { name: 'Limpar os filtros?' })).toBeVisible();
  await expect(confirm).toHaveAccessibleDescription('A lista volta a mostrar todos os artigos.');

  await page.keyboard.press('Escape');
  await expect(confirm).toHaveCount(0);
  await expect(drawer.getByRole('heading', { name: 'Filtros' })).toBeVisible();
  await expect(clear).toBeFocused();
  await expect(appRoot(page)).toHaveAttribute('inert', '');

  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(appRoot(page)).not.toHaveAttribute('inert');
});

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Drawer ${reducedMotion === 'reduce' ? 'abre sem' : 'abre com'} transição com reducedMotion ${reducedMotion}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await login(page);
    await page.goto(SHOWCASE);
    await page.waitForLoadState('networkidle');

    // A posição `right` da gaveta a cada quadro, do momento em que ela entra no DOM até 500 ms
    // depois (a transição padrão do motion leva cerca de 300 ms), e a transição do overlay.
    const { positions, overlayTransition } = await page.evaluate(
      () =>
        new Promise<{ positions: number[]; overlayTransition: string }>((resolve) => {
          const values: number[] = [];
          const observer = new MutationObserver(() => {
            const content = document.querySelector<HTMLElement>('.drawer-content');
            if (!content) return;
            observer.disconnect();
            const start = performance.now();
            const sample = () => {
              values.push(parseFloat(getComputedStyle(content).right));
              if (performance.now() - start < 500) requestAnimationFrame(sample);
              else
                resolve({
                  positions: values,
                  overlayTransition: getComputedStyle(document.querySelector('.drawer-overlay')!)
                    .transitionDuration,
                });
            };
            requestAnimationFrame(sample);
          });
          observer.observe(document.body, { childList: true, subtree: true });
          [...document.querySelectorAll('button')]
            .find((button) => button.textContent === 'Abrir Drawer')!
            .click();
        }),
    );

    expect(positions.at(-1)).toBe(0);
    const intermediate = positions.filter((value) => value < 0 && value > -400);
    if (reducedMotion === 'reduce') {
      expect(positions[0]).toBe(0);
      expect(intermediate).toEqual([]);
      expect(overlayTransition).toBe('0s');
    } else {
      expect(intermediate.length).toBeGreaterThan(0);
    }
  });
}

// Tooltip (#211) sobre o floating-ui: abre no hover e no foco do teclado, descreve o gatilho por
// aria-describedby, fecha com Esc, aceita o ponteiro sobre a dica (1.4.13) e não anima com
// movimento reduzido.

/** Põe o foco logo antes da seção do Tooltip, para o próximo Tab chegar ao primeiro gatilho. */
async function focusBeforeTooltip(page: Page): Promise<void> {
  await page.locator('#vitrine-tooltip').evaluate((heading) => {
    heading.setAttribute('tabindex', '-1');
    (heading as HTMLElement).focus();
  });
}

test('Tooltip no hover: descreve o gatilho, aceita o ponteiro sobre a dica e fecha com Esc', async ({
  page,
}) => {
  await login(page);
  await page.goto(SHOWCASE);
  await page.waitForLoadState('networkidle');
  const trigger = page.getByRole('button', { name: 'Copiar link' });

  await expect(trigger).not.toHaveAttribute('aria-describedby');
  await trigger.hover();
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toHaveText('Copia o endereço público do artigo');
  await expect(trigger).toHaveAttribute('aria-describedby', (await tooltip.getAttribute('id'))!);
  await expect(trigger).toHaveAccessibleDescription('Copia o endereço público do artigo');

  // Do gatilho até a dica, a dica continua aberta.
  await tooltip.hover();
  await page.waitForTimeout(300);
  await expect(tooltip).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveCount(0);
  await expect(trigger).not.toHaveAttribute('aria-describedby');
});

test('Tooltip no foco do teclado: Esc fecha e o foco fica no gatilho', async ({ page }) => {
  await login(page);
  await page.goto(SHOWCASE);
  await page.waitForLoadState('networkidle');
  const trigger = page.getByRole('button', { name: 'Copiar link' });

  await focusBeforeTooltip(page);
  await page.keyboard.press('Tab');
  await expect(trigger).toBeFocused();
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toHaveText('Copia o endereço público do artigo');
  await expect(trigger).toHaveAttribute('aria-describedby', (await tooltip.getAttribute('id'))!);

  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).not.toHaveAttribute('aria-describedby');

  // O próximo gatilho abre a dica dele.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Ver no site' })).toBeFocused();
  await expect(page.getByRole('tooltip')).toHaveText('Abre o artigo publicado');
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`Tooltip visível sem violação do axe (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await login(page);
    await page.goto(SHOWCASE);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Copiar link' }).hover();
    const tooltip = page.getByRole('tooltip');
    // A transição (150 ms) mistura a cor do texto com o fundo enquanto a opacidade sobe.
    await expect(tooltip).toHaveCSS('opacity', '1');
    const accessibility = await audit(page);
    expect(accessibility.violations).toEqual([]);
  });
}

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Tooltip ${reducedMotion === 'reduce' ? 'aparece sem' : 'aparece com'} transição com reducedMotion ${reducedMotion}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await login(page);
    await page.goto(SHOWCASE);
    await page.waitForLoadState('networkidle');

    // A opacidade da dica a cada quadro, do momento em que ela entra no DOM até 400 ms depois
    // (a transição do Ecme dura 150 ms). Valores intermediários são a animação.
    const watch = page.evaluate(
      () =>
        new Promise<number[]>((resolve) => {
          const values: number[] = [];
          const observer = new MutationObserver(() => {
            const tooltip = document.querySelector<HTMLElement>('[role="tooltip"]');
            if (!tooltip) return;
            observer.disconnect();
            const start = performance.now();
            const sample = () => {
              values.push(Number(getComputedStyle(tooltip).opacity));
              if (performance.now() - start < 400) requestAnimationFrame(sample);
              else resolve(values);
            };
            requestAnimationFrame(sample);
          });
          observer.observe(document.body, { childList: true, subtree: true });
        }),
    );
    await page.getByRole('button', { name: 'Copiar link' }).hover();
    const samples = await watch;

    const intermediate = samples.filter((value) => value > 0 && value < 1);
    expect(samples.at(-1)).toBe(1);
    if (reducedMotion === 'reduce') {
      expect(samples[0]).toBe(1);
      expect(intermediate).toEqual([]);
    } else {
      expect(intermediate.length).toBeGreaterThan(0);
    }
  });
}

test('Avatar.Group mostra "+N" e a dica "N a mais" no avatar omitido', async ({ page }) => {
  await login(page);
  await page.goto(SHOWCASE);
  await page.waitForLoadState('networkidle');
  const group = section(page, 'Avatar').locator('.avatar-group');

  await expect(group.locator('.avatar')).toHaveText(['AS', 'MR', 'JP', '+2']);
  const omitted = group.locator('.avatar').last();
  await omitted.hover();
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toHaveText('2 a mais');
  await expect(omitted).toHaveAttribute('aria-describedby', (await tooltip.getAttribute('id'))!);
});

// Alert, Notification e toast (#212): o toast sem raiz React própria, mostrado pelo ToastProvider
// do layout numa região viva que já existe antes da mensagem, fora do contêiner da app.

const toastRegion = (page: Page) => page.locator('[data-toast-placement="top-end"]');

test('toast de sucesso aparece na região viva já montada e sai depois do duration', async ({
  page,
}) => {
  await login(page);
  await page.goto(SHOWCASE);
  await page.waitForLoadState('networkidle');

  // A região da placement padrão existe, vazia, antes do primeiro toast.
  await expect(toastRegion(page)).toHaveAttribute('role', 'status');
  await expect(toastRegion(page)).toHaveText('');

  await page.getByRole('button', { name: 'Mostrar toast de sucesso' }).click();
  const message = toastRegion(page).getByText('Rascunho salvo');
  await expect(message).toBeVisible();
  const shownAt = Date.now();
  await expect(message).toHaveCount(0, { timeout: 5000 });
  // duration de 2 s: não sai antes, e sai logo depois.
  const elapsed = Date.now() - shownAt;
  expect(elapsed).toBeGreaterThan(1500);
  expect(elapsed).toBeLessThan(3500);
});

test('toast de erro vai num role="alert"; Fechar pelo teclado tira o de sucesso', async ({
  page,
}) => {
  await login(page);
  await page.goto(SHOWCASE);
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: 'Mostrar toast de erro' }).click();
  await expect(toastRegion(page).getByRole('alert')).toContainText('Falha ao publicar');

  await page.getByRole('button', { name: 'Mostrar toast de sucesso' }).click();
  const close = toastRegion(page)
    .locator('.notification', { hasText: 'Rascunho salvo' })
    .getByRole('button', { name: 'Fechar' });
  await close.focus();
  await page.keyboard.press('Enter');
  await expect(toastRegion(page).getByText('Rascunho salvo')).toHaveCount(0);
});

test('toast disparado de dentro do Dialog fica fora do #app-root inerte', async ({ page }) => {
  await login(page);
  await page.goto(SHOWCASE);
  await page.waitForLoadState('networkidle');

  await section(page, 'Dialog').getByRole('button', { name: 'Abrir Dialog' }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar autor' });
  await dialog.getByRole('button', { name: 'Mostrar aviso' }).click();
  await expect(page.locator('#app-root')).toHaveAttribute('inert', '');

  const message = toastRegion(page).getByText('Aviso de dentro do diálogo');
  await expect(message).toBeVisible();
  expect(
    await message.evaluate((element) => ({
      insideApp: element.closest('#app-root') !== null,
      inert: element.closest('[inert]') !== null,
      hidden: element.closest('[aria-hidden="true"]') !== null,
    })),
  ).toEqual({ insideApp: false, inert: false, hidden: false });
});

test('Alert closable: Fechar com contorno de 2px e pelo teclado', async ({ page }) => {
  await login(page);
  await page.goto(SHOWCASE);
  await page.waitForLoadState('networkidle');
  const alerts = section(page, 'Alert');
  const close = alerts.getByRole('button', { name: 'Fechar' });

  await page.locator('#vitrine-alert').evaluate((heading) => {
    heading.setAttribute('tabindex', '-1');
    (heading as HTMLElement).focus();
  });
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  expect(
    await close.evaluate((element) => {
      const style = getComputedStyle(element);
      return { style: style.outlineStyle, width: style.outlineWidth };
    }),
  ).toEqual({ style: 'solid', width: '2px' });

  await page.keyboard.press('Enter');
  await expect(alerts.getByText('Aviso que pode ser fechado.')).toHaveCount(0);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`Alert nos quatro tipos e toast visível sem violação do axe (${colorScheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await login(page);
    await page.goto(SHOWCASE);
    await page.waitForLoadState('networkidle');

    await expect(section(page, 'Alert').locator('.alert')).toHaveCount(5);
    await page.getByRole('button', { name: 'Mostrar toast de sucesso' }).click();
    await page.getByRole('button', { name: 'Mostrar toast de erro' }).click();
    await expect(toastRegion(page).locator('.notification')).toHaveCount(2);
    const accessibility = await audit(page);
    expect(accessibility.violations).toEqual([]);
  });
}

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`toast ${reducedMotion === 'reduce' ? 'aparece sem' : 'aparece com'} transição com reducedMotion ${reducedMotion}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await login(page);
    await page.goto(SHOWCASE);
    await page.waitForLoadState('networkidle');

    // A opacidade do item a cada quadro, do momento em que ele entra no DOM até 400 ms depois
    // (a transição do Ecme dura 150 ms). Valores intermediários são a animação.
    const watch = page.evaluate(
      () =>
        new Promise<number[]>((resolve) => {
          const values: number[] = [];
          const observer = new MutationObserver(() => {
            const item = document.querySelector<HTMLElement>('.toast-wrapper');
            if (!item) return;
            observer.disconnect();
            const start = performance.now();
            const sample = () => {
              values.push(Number(getComputedStyle(item).opacity));
              if (performance.now() - start < 400) requestAnimationFrame(sample);
              else resolve(values);
            };
            requestAnimationFrame(sample);
          });
          observer.observe(document.body, { childList: true, subtree: true });
        }),
    );
    await page.getByRole('button', { name: 'Mostrar toast de sucesso' }).click();
    const samples = await watch;

    const intermediate = samples.filter((value) => value > 0 && value < 1);
    expect(samples.at(-1)).toBe(1);
    if (reducedMotion === 'reduce') {
      expect(samples[0]).toBe(1);
      expect(intermediate).toEqual([]);
    } else {
      expect(intermediate.length).toBeGreaterThan(0);
    }
  });
}

// Table e Tabs (#213): cabeçalho ordenável com aria-sort no <th>, e abas no padrão do APG (só a
// ativa no Tab, setas e Home/End movem e ativam pulando a desabilitada, painel ligado à aba).

test('Table: cabeçalho com scope e aria-sort que alterna pelo teclado', async ({ page }) => {
  await login(page);
  await page.goto(SHOWCASE);
  await page.waitForLoadState('networkidle');
  const table = page.getByRole('table', { name: 'Artigos' });
  const header = table.getByRole('columnheader', { name: 'Título' });
  const firstCell = table.getByRole('row').nth(1).getByRole('cell').first();

  await expect(header).toHaveAttribute('scope', 'col');
  await expect(header).toHaveAttribute('aria-sort', 'none');
  await expect(table.getByRole('columnheader', { name: 'Status' })).not.toHaveAttribute(
    'aria-sort',
  );
  await expect(
    page
      .getByRole('table', { name: 'Sites compactos' })
      .getByRole('rowheader', { name: 'Exemplo A' }),
  ).toHaveAttribute('scope', 'row');

  const sortButton = header.getByRole('button', { name: 'Título' });
  await tabTo(page, sortButton);
  await page.keyboard.press('Enter');
  await expect(header).toHaveAttribute('aria-sort', 'ascending');
  await expect(firstCell).toHaveText('Análise do mercado');

  await page.keyboard.press('Space');
  await expect(header).toHaveAttribute('aria-sort', 'descending');
  await expect(firstCell).toHaveText('Receita de pão');
  await expect(sortButton).toBeFocused();
});

test('Tabs: só a aba ativa no Tab; setas pulam a desabilitada, Home e End; Tab vai ao painel', async ({
  page,
}) => {
  await login(page);
  await page.goto(SHOWCASE);
  await page.waitForLoadState('networkidle');
  const list = page.getByRole('tablist', { name: 'Configuração do site' });
  const tab = (name: string) => list.getByRole('tab', { name });
  const panel = section(page, 'Tabs').getByRole('tabpanel').first();

  await tabTo(page, tab('Geral'));
  await expect(tab('Geral')).toHaveAttribute('aria-selected', 'true');
  await expect(tab('SEO')).toBeDisabled();
  await expect(panel).toHaveText('Nome, domínio e idioma do site.');
  await expect(panel).toHaveAttribute('aria-labelledby', (await tab('Geral').getAttribute('id'))!);

  await page.keyboard.press('ArrowRight');
  await expect(tab('Tema')).toBeFocused();
  await expect(tab('Tema')).toHaveAttribute('aria-selected', 'true');
  await expect(tab('Geral')).toHaveAttribute('aria-selected', 'false');
  await expect(panel).toHaveText('Cores e fontes do site.');

  await page.keyboard.press('ArrowRight');
  await expect(tab('Geral')).toBeFocused();
  await page.keyboard.press('End');
  await expect(tab('Tema')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(tab('Geral')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(tab('Tema')).toBeFocused();

  // Foco de 2px na aba, como no resto da vitrine.
  expect(
    await tab('Tema').evaluate((element) => {
      const style = getComputedStyle(element);
      return { style: style.outlineStyle, width: style.outlineWidth };
    }),
  ).toEqual({ style: 'solid', width: '2px' });

  await page.keyboard.press('Tab');
  await expect(panel).toBeFocused();
  await expect(panel).toHaveAttribute('aria-labelledby', (await tab('Tema').getAttribute('id'))!);
  await page.keyboard.press('Shift+Tab');
  await expect(tab('Tema')).toBeFocused();
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`Table ordenada e Tabs com outra aba ativa sem violação do axe (${colorScheme})`, async ({
    page,
  }) => {
    // Sem a transição de cor da aba (motion-reduce:transition-none), o axe mede a cor final, não
    // a intermediária da troca de aba.
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await login(page);
    await page.goto(SHOWCASE);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Título' }).click();
    await page.getByRole('tab', { name: 'Tema' }).click();
    await page.getByRole('tab', { name: 'Publicados' }).click();
    await expect(page.getByRole('tab', { name: 'Publicados' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    const accessibility = await new AxeBuilder({ page })
      .withTags(WCAG)
      .include('[aria-labelledby="vitrine-table"]')
      .include('[aria-labelledby="vitrine-tabs"]')
      .analyze();
    expect(accessibility.violations).toEqual([]);
  });
}

// Pagination (#214): nav "Paginação" com página atual em aria-current, pontas indisponíveis,
// alvos de 24 px e teclado; no modo link (getPageHref), a página vem de ?pagina-link= (o
// ?pagina= é do DataTable, #215) e os links funcionam renderizados no servidor.

const paginations = (page: Page) =>
  section(page, 'Pagination').getByRole('navigation', { name: 'Paginação' });

test('Pagination com botões: aria-current, pontas indisponíveis, teclado e alvos de 24 px', async ({
  page,
}) => {
  await login(page);
  await page.goto(SHOWCASE);
  await page.waitForLoadState('networkidle');
  const nav = paginations(page).first();
  const status = section(page, 'Pagination').getByRole('status');

  await expect(nav.getByText('Total de 100 itens')).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Página 1', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(nav.getByRole('button', { name: 'Página anterior' })).toBeDisabled();

  for (const control of await nav.getByRole('button').all()) {
    const box = await control.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(24);
    expect(box?.height).toBeGreaterThanOrEqual(24);
  }

  const next = nav.getByRole('button', { name: 'Próxima página' });
  await tabTo(page, next);
  await page.keyboard.press('Enter');
  await expect(status).toHaveText('Página escolhida: 2.');
  await expect(nav.getByRole('button', { name: 'Página 2' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  const last = nav.getByRole('button', { name: 'Página 10' });
  await tabTo(page, last);
  await page.keyboard.press('Space');
  await expect(status).toHaveText('Página escolhida: 10.');
  await expect(next).toBeDisabled();
});

test('Pagination com links: ?pagina-link= no servidor, ponta sem href e Enter navega', async ({
  page,
}) => {
  await login(page);
  const response = await page.request.get(`${SHOWCASE}?pagina-link=7`);
  const html = await response.text();
  expect(html).toContain('href="/teste-de-componentes?pagina-link=8"');
  expect(html).toMatch(
    /<a[^>]*aria-current="page"[^>]*href="\/teste-de-componentes\?pagina-link=7"/,
  );

  await page.goto(`${SHOWCASE}?pagina-link=20`);
  await page.waitForLoadState('networkidle');
  const nav = paginations(page).last();

  await expect(nav.getByRole('link', { name: 'Página 20' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  const next = nav.getByRole('link', { name: 'Próxima página' });
  await expect(next).toHaveAttribute('aria-disabled', 'true');
  await expect(next).not.toHaveAttribute('href');
  await expect(nav.getByRole('link', { name: 'Voltar 5 páginas' })).toHaveAttribute(
    'href',
    '/teste-de-componentes?pagina-link=15',
  );

  for (const control of await nav.getByRole('link').all()) {
    const box = await control.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(24);
    expect(box?.height).toBeGreaterThanOrEqual(24);
  }

  const prev = nav.getByRole('link', { name: 'Página anterior' });
  await tabTo(page, prev);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\?pagina-link=19$/);
  await expect(paginations(page).last().getByRole('link', { name: 'Página 19' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`Pagination nos dois modos, com ponta indisponível, sem violação do axe (${colorScheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await login(page);
    await page.goto(`${SHOWCASE}?pagina-link=20`);
    await page.waitForLoadState('networkidle');
    await paginations(page).first().getByRole('button', { name: 'Página 2' }).click();

    const accessibility = await new AxeBuilder({ page })
      .withTags(WCAG)
      .include('[aria-labelledby="vitrine-pagination"]')
      .analyze();
    expect(accessibility.violations).toEqual([]);
  });
}

// DataTable (#215): dados fixos paginados e ordenados pela vitrine (manual, como no Ecme), com
// página, ordem e tamanho na URL; recarregar mantém a mesma visão. Carregando, o esqueleto;
// vazio, a mensagem.

const dataTable = (page: Page, name: string) =>
  section(page, 'DataTable').getByRole('table', { name });

/** Texto da primeira célula de cada linha do corpo. */
async function firstCells(table: Locator): Promise<string[]> {
  return table
    .locator('tbody tr')
    .evaluateAll((rows) => rows.map((row) => row.querySelector('td')?.textContent ?? ''));
}

test('DataTable pagina e ordena pela URL, por teclado, e recarregar mantém a visão', async ({
  page,
}) => {
  await login(page);
  await page.goto(SHOWCASE);
  await page.waitForLoadState('networkidle');
  const table = dataTable(page, 'Matérias paginadas');
  const nav = section(page, 'DataTable').getByRole('navigation', { name: 'Paginação' }).first();
  const manchete = table.getByRole('columnheader', { name: 'Manchete' });

  // Sem parâmetros: 25 por página, na ordem padrão (título crescente).
  expect(await firstCells(table)).toHaveLength(25);
  expect((await firstCells(table))[0]).toBe('Matéria 01');
  await expect(manchete).toHaveAttribute('aria-sort', 'ascending');
  await expect(table.getByRole('columnheader', { name: 'Situação' })).not.toHaveAttribute(
    'aria-sort',
  );

  await nav.getByRole('button', { name: 'Página 2' }).click();
  await expect(page).toHaveURL(/\?pagina=2$/);
  await expect
    .poll(() => firstCells(table))
    .toEqual([...Array(7).keys()].map((i) => `Matéria ${26 + i}`));

  const sortButton = manchete.getByRole('button', { name: 'Manchete' });
  await tabTo(page, sortButton);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\?pagina=2&ordem=-titulo$/);
  await expect(manchete).toHaveAttribute('aria-sort', 'descending');
  await expect.poll(async () => (await firstCells(table))[0]).toBe('Matéria 07');

  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(manchete).toHaveAttribute('aria-sort', 'descending');
  await expect(nav.getByRole('button', { name: 'Página 2' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect((await firstCells(table))[0]).toBe('Matéria 07');
});

test('DataTable: o seletor grava ?por-pagina=, volta à página 1 e sobrevive ao recarregar', async ({
  page,
}) => {
  await login(page);
  await page.goto(`${SHOWCASE}?pagina=2`);
  await page.waitForLoadState('networkidle');
  const table = dataTable(page, 'Matérias paginadas');
  const select = section(page, 'DataTable')
    .getByRole('combobox', { name: 'Itens por página' })
    .first();

  await select.focus();
  await page.keyboard.press('ArrowDown');
  await page.getByRole('option', { name: '10 / página' }).click();
  await expect(page).toHaveURL(/\?por-pagina=10$/);
  await expect.poll(() => firstCells(table)).toHaveLength(10);
  expect((await firstCells(table))[0]).toBe('Matéria 01');

  await page.reload();
  await page.waitForLoadState('networkidle');
  expect(await firstCells(table)).toHaveLength(10);
  await expect(section(page, 'DataTable').getByText('10 / página').first()).toBeVisible();
});

test('DataTable carregando mostra o esqueleto com aria-busy; vazio mostra a mensagem', async ({
  page,
}) => {
  await login(page);
  await page.goto(SHOWCASE);
  await page.waitForLoadState('networkidle');

  const loading = dataTable(page, 'Matérias carregando');
  await expect(loading).toHaveAttribute('aria-busy', 'true');
  await expect(loading.locator('tbody tr')).toHaveCount(10);
  await expect(loading.locator('tbody .skeleton').first()).toBeVisible();

  const empty = dataTable(page, 'Matérias vazias');
  await expect(empty.getByText('Nenhum dado encontrado!')).toBeVisible();
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`DataTable sem violação do axe (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await login(page);
    await page.goto(`${SHOWCASE}?pagina=2&ordem=-visitas`);
    await page.waitForLoadState('networkidle');

    const accessibility = await new AxeBuilder({ page })
      .withTags(WCAG)
      .include('[aria-labelledby="vitrine-data-table"]')
      .analyze();
    expect(accessibility.violations).toEqual([]);
  });
}

// Menu e NavToggle (#235): nav nomeado com o grupo como lista nomeada pelo rótulo, link do
// item ativo com aria-current, foco de 2px no --ring nos links e no botão do NavToggle, que
// recolhe o menu (aria-expanded, rótulo do grupo escondido) pelo Enter.

/** Contorno de foco do elemento: cor, estilo e largura. */
const outline = (target: Locator) =>
  target.evaluate((element) => {
    const style = getComputedStyle(element);
    return { color: style.outlineColor, style: style.outlineStyle, width: style.outlineWidth };
  });

const ringColor = (page: Page) =>
  page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--ring)';
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });

test('Menu: nav nomeado, grupo em lista com rótulo e item ativo com aria-current', async ({
  page,
}) => {
  await login(page);
  await page.goto(SHOWCASE);
  await page.waitForLoadState('networkidle');

  const nav = section(page, 'Menu').getByRole('navigation', { name: 'Menu de exemplo' });
  const list = nav.getByRole('list', { name: 'Áreas do site' });
  await expect(list.getByRole('listitem')).toHaveCount(3);
  await expect(nav.getByRole('link', { name: 'Conteúdos' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(nav.getByRole('link', { name: 'Mídia' })).not.toHaveAttribute('aria-current');
  await expect(nav.locator('.menu-item-active')).toHaveText('Conteúdos');
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`Menu e NavToggle com foco de 2px, recolher por Enter e sem violação do axe (${colorScheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await login(page);
    await page.goto(SHOWCASE);
    await page.waitForLoadState('networkidle');
    const ring = await ringColor(page);
    const menu = section(page, 'Menu');
    const toggle = menu.getByRole('button', { name: 'Alternar o menu de exemplo' });
    const link = menu.getByRole('link', { name: 'Visão geral' });

    await tabTo(page, toggle);
    expect(await outline(toggle)).toEqual({ color: ring, style: 'solid', width: '2px' });
    const box = await toggle.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(24);
    expect(box?.height).toBeGreaterThanOrEqual(24);

    await tabTo(page, link);
    expect(await outline(link)).toEqual({ color: ring, style: 'solid', width: '2px' });

    const accessibility = await new AxeBuilder({ page })
      .withTags(WCAG)
      .include('[aria-labelledby="vitrine-menu"]')
      .analyze();
    expect(accessibility.violations).toEqual([]);

    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const icon = await toggle.locator('svg').innerHTML();
    await tabTo(page, toggle);
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(await toggle.locator('svg').innerHTML()).not.toBe(icon);
    await expect(menu.getByText('Áreas do site', { exact: true })).toHaveCount(0);
    await expect(menu.getByRole('link', { name: 'Conteúdos' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    const collapsed = await new AxeBuilder({ page })
      .withTags(WCAG)
      .include('[aria-labelledby="vitrine-menu"]')
      .analyze();
    expect(collapsed.violations).toEqual([]);
  });
}
