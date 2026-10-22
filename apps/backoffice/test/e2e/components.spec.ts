import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Editor } from '@tiptap/core';

// Vitrine dos componentes do Ecme (#205; workspace#45): cada componente portado auditado com
// axe e teclado nos dois temas, renderizado no servidor sem aviso de hidratação. Com movimento
// reduzido, o MotionConfig do layout desliga as animações de transform do `motion`.
// Formulários e ações (Button, IconButton, Input, FormItem, Checkbox, Switcher, Radio, Segment,
// TimeInput, Upload, DateTimepicker, Select, movimento, Loading, Skeleton e StickyFooter) têm o
// teclado, o foco e o axe nos testes de componente em Chromium (`*.browser.test.tsx`, #457);
// aqui ficam a auditoria da página inteira e o render no servidor.

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

/** Leva o foco até o controle só com Tab (no máximo 300 passos: a vitrine cresce a cada Task). */
async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let step = 0; step < 300; step += 1) {
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

test('a vitrine vem renderizada do servidor', { tag: '@smoke' }, async ({ page }) => {
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

    await page.getByRole('button', { name: 'Título', exact: true }).click();
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

// DataTable (#215, #361): a lista completa no padrão do template, calculada pelo `useListTable`,
// com busca, filtro, ordem, página e tamanho na URL; recarregar mantém a mesma visão. Lista vazia
// com a ação principal; busca sem resultado só com a mensagem (a ação de limpar é a da toolbar);
// carregando, o esqueleto.

const dataTable = (page: Page, name: string) =>
  section(page, 'DataTable').getByRole('table', { name, exact: true });

const materias = (page: Page) => dataTable(page, 'Matérias');

/** Texto do link principal de cada linha do corpo (a manchete, sem o resumo). */
async function firstCells(table: Locator): Promise<string[]> {
  return table
    .locator('tbody tr')
    .evaluateAll((rows) =>
      rows.map((row) => row.querySelector('td a')?.textContent ?? row.textContent ?? ''),
    );
}

const resultCount = (page: Page) =>
  section(page, 'DataTable')
    .getByRole('status')
    .filter({ hasText: /resultado/ });

test('DataTable pagina e ordena pela URL, por teclado, e recarregar mantém a visão', async ({
  page,
}) => {
  await login(page);
  await page.goto(SHOWCASE);
  await page.waitForLoadState('networkidle');
  const table = materias(page);
  const nav = section(page, 'DataTable').getByRole('navigation', { name: 'Paginação' }).first();
  const manchete = table.getByRole('columnheader', { name: 'Manchete' });

  // Sem parâmetros: 25 por página, na ordem padrão (manchete crescente), com a contagem.
  expect(await firstCells(table)).toHaveLength(25);
  expect((await firstCells(table))[0]).toBe('Matéria 01');
  await expect(resultCount(page)).toHaveText('32 resultados');
  await expect(resultCount(page)).toHaveClass(/tabular-nums/);
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
  const table = materias(page);
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

test('DataTable: busca sem acento e filtro na URL; sem resultado, só a mensagem e um "Limpar filtros"', async ({
  page,
}) => {
  await login(page);
  await page.goto(SHOWCASE);
  await page.waitForLoadState('networkidle');
  const card = section(page, 'DataTable');
  const table = materias(page);
  const search = card.getByRole('searchbox', { name: 'Buscar por manchete' });
  const clear = card.getByRole('button', { name: 'Limpar filtros' });

  await expect(clear).toHaveCount(0);
  await search.fill('materia 1');
  await expect(page).toHaveURL(/\?q=materia\+1$/);
  await expect(resultCount(page)).toHaveText('10 resultados');

  await card.getByLabel('Situação').focus();
  await page.keyboard.press('ArrowDown');
  await page.getByRole('option', { name: 'Em revisão' }).click();
  await expect(page).toHaveURL(/\?q=materia\+1&situacao=revisao$/);
  await expect.poll(() => firstCells(table)).toEqual(['Matéria 12', 'Matéria 15', 'Matéria 18']);

  // Recarregar mantém busca e filtro (a URL é a fonte). Espera pela contagem: aqui o
  // `networkidle` não chegava dentro do tempo do teste.
  await page.reload();
  await expect(resultCount(page)).toHaveText('3 resultados');
  await expect(search).toHaveValue('materia 1');

  await search.fill('nada por aqui');
  await expect(table.getByText('Nenhuma matéria encontrada.')).toBeVisible();
  await expect(resultCount(page)).toHaveText('0 resultados');
  await expect(table.locator('tbody').getByRole('button')).toHaveCount(0);
  await expect(clear).toHaveCount(1);

  await clear.click();
  await expect(page).toHaveURL(new RegExp(`${SHOWCASE}$`));
  await expect(resultCount(page)).toHaveText('32 resultados');
  await expect(clear).toHaveCount(0);
  await expect(search).toBeFocused();
});

test('DataTable: toolbar em coluna abaixo de md e em linha a partir de md', async ({ page }) => {
  await login(page);
  await page.goto(SHOWCASE);
  await page.waitForLoadState('networkidle');
  const toolbar = section(page, 'DataTable').getByRole('search');
  const direction = () => toolbar.evaluate((element) => getComputedStyle(element).flexDirection);

  await page.setViewportSize({ width: 1280, height: 800 });
  expect(await direction()).toBe('row');
  await page.setViewportSize({ width: 600, height: 800 });
  expect(await direction()).toBe('column');
});

test('DataTable: lista vazia mostra a ação principal; carregando, o esqueleto com aria-busy', async ({
  page,
}) => {
  await login(page);
  await page.goto(SHOWCASE);
  await page.waitForLoadState('networkidle');
  const card = section(page, 'DataTable');

  await expect(card.getByText('Nenhum rascunho cadastrado.')).toBeVisible();
  // A ação do cabeçalho e a repetida no estado vazio, nos dois cartões: 3 no total.
  await expect(card.getByRole('link', { name: 'Nova matéria' })).toHaveCount(3);

  const loading = dataTable(page, 'Matérias carregando');
  await expect(loading).toHaveAttribute('aria-busy', 'true');
  await expect(loading.locator('tbody tr')).toHaveCount(10);
  await expect(loading.locator('tbody .skeleton').first()).toBeVisible();
});

test('DataTable: a ação da linha é um link de ícone com dica, alcançado por Tab', async ({
  page,
}) => {
  await login(page);
  await page.goto(SHOWCASE);
  await page.waitForLoadState('networkidle');
  const table = materias(page);
  const row = table.locator('tbody tr').first();
  const edit = row.getByRole('link', { name: 'Editar Matéria 01', exact: true });

  // Botão de ícone (#441): sem texto visível, o lápis aria-hidden e a dica no foco.
  await expect(edit).toHaveText('');
  await expect(edit.locator('[aria-hidden="true"] svg')).toHaveCount(1);
  await row.getByRole('link', { name: 'Matéria 01', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(edit).toBeFocused();
  await expect(page.getByRole('tooltip')).toHaveText('Editar Matéria 01');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#vitrine-data-table$/);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`DataTable sem violação do axe, com e sem resultado (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await login(page);
    for (const query of ['?pagina=2&ordem=-visitas', '?q=nada+por+aqui&situacao=rascunho']) {
      await page.goto(`${SHOWCASE}${query}`);
      await page.waitForLoadState('networkidle');

      const accessibility = await new AxeBuilder({ page })
        .withTags(WCAG)
        .include('[aria-labelledby="vitrine-data-table"]')
        .exclude('[data-floating-ui-focus-guard]')
        .analyze();
      expect(accessibility.violations).toEqual([]);
    }
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

// EllipsisButton, Container e BottomStickyBar (#322): o botão de "mais ações" com nome e ícone
// oculto, e a barra de ações do formulário presa ao fim da janela, encostada nas bordas do
// `main` (margem negativa igual ao gutter) em cada breakpoint.

for (const colorScheme of ['light', 'dark'] as const) {
  test(`EllipsisButton e BottomStickyBar: alvo de 24 px, foco de 2px, barra nas bordas do main e sem violação do axe (${colorScheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await login(page);
    const hydration = hydrationMessages(page);
    await page.goto(SHOWCASE);
    await page.waitForLoadState('networkidle');
    const ring = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--ring)';
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });

    const bar = section(page, 'BottomStickyBar');
    const buttons = [
      section(page, 'EllipsisButton').getByRole('button', { name: 'Mais ações do site' }),
      section(page, 'EllipsisButton').getByRole('button', { name: 'Mais ações', exact: true }),
      bar.getByRole('button', { name: 'Mais ações do formulário' }),
      bar.getByRole('button', { name: 'Descartar' }),
      bar.getByRole('button', { name: 'Publicar' }),
    ];
    for (const button of buttons) {
      await tabTo(page, button);
      const box = await button.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(24);
      expect(box?.height).toBeGreaterThanOrEqual(24);
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
    for (const button of [buttons[0]!, buttons[2]!]) {
      await expect(button).toHaveText('');
      await expect(button.locator('[aria-hidden="true"] svg')).toHaveCount(1);
    }

    const accessibility = await new AxeBuilder({ page })
      .withTags(WCAG)
      .include('[aria-labelledby="vitrine-ellipsis-button"]')
      .include('[aria-labelledby="vitrine-container"]')
      .include('[aria-labelledby="vitrine-barra-de-acoes"]')
      .analyze();
    expect(accessibility.violations).toEqual([]);
    expect(hydration).toEqual([]);
  });
}

// Larguras dos três gutters do `main` (`px-4 sm:px-6 md:px-8`): abaixo de `sm`, entre `sm` e
// `md` e acima de `md`.
for (const width of [375, 700, 1280]) {
  test(`BottomStickyBar presa ao fim da janela e encostada nas bordas do main (${width} px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await login(page);
    await page.goto(SHOWCASE);
    await page.waitForLoadState('networkidle');
    const publish = section(page, 'BottomStickyBar').getByRole('button', { name: 'Publicar' });
    const barElement = publish.locator('xpath=ancestor::div[contains(@class, "sticky")][1]');

    // No meio do formulário longo, o fim da seção está abaixo da janela: a barra gruda embaixo.
    await page.locator('[data-vitrine-rolagem-barra]').evaluate((element) => {
      element.scrollIntoView({ block: 'center' });
    });
    await expect(publish).toBeInViewport();
    const barBox = (await barElement.boundingBox())!;
    expect(Math.abs(barBox.y + barBox.height - 800)).toBeLessThanOrEqual(1);

    const mainBox = (await page.locator('main#conteudo').boundingBox())!;
    expect(Math.abs(barBox.x - mainBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(barBox.width - mainBox.width)).toBeLessThanOrEqual(1);
  });
}

// Lista de dados e linha de metadados (#368): o `CustomerInfoField` do Ecme, com o rótulo em
// cima e o valor embaixo. A 375 px, o valor de 120 caracteres sem espaço nem hífen quebra dentro
// do cartão, e nada da seção passa da janela; o axe passa nos dois temas.
for (const colorScheme of ['light', 'dark'] as const) {
  test(`lista de dados quebra o valor longo a 375 px, sem violação do axe (${colorScheme})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.emulateMedia({ colorScheme });
    await login(page);
    const hydration = hydrationMessages(page);
    await page.goto(SHOWCASE);
    await page.waitForLoadState('networkidle');
    const showcase = section(page, 'Lista de dados e linha de metadados');

    const terms = showcase.getByRole('term');
    await expect(terms).toHaveText(['Domínio', 'Identificador', 'Slug', 'Status']);
    await expect(showcase.getByText('Publicado')).toBeVisible();

    // O valor longo ocupa várias linhas, dentro da largura do cartão.
    const value = showcase.locator('[data-vitrine-valor-longo]');
    await expect(value).toHaveText('guiacompleto'.repeat(10));
    const valueBox = (await value.boundingBox())!;
    const listBox = (await showcase.locator('dl').boundingBox())!;
    expect(valueBox.x + valueBox.width).toBeLessThanOrEqual(listBox.x + listBox.width + 1);
    const lineHeight = await value.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).lineHeight),
    );
    expect(valueBox.height).toBeGreaterThan(lineHeight * 1.5);
    // Nada da seção passa da janela: a página não rola por causa dela. (A vitrine inteira rola a
    // 375 px por outras seções, como a Pagination e o DataTable; por isso a medida é da seção.)
    const overflow = await showcase.evaluate((element) => {
      const right = Math.max(
        element.getBoundingClientRect().right,
        ...[...element.querySelectorAll('*')].map((child) => child.getBoundingClientRect().right),
      );
      return { right, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
    });
    expect(overflow.right).toBeLessThanOrEqual(375);
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);

    const accessibility = await new AxeBuilder({ page })
      .withTags(WCAG)
      .include('[aria-labelledby="vitrine-lista-de-dados"]')
      .analyze();
    expect(accessibility.violations).toEqual([]);
    expect(hydration).toEqual([]);
  });
}

// Mídia (#389): o seletor do editor, os detalhes da biblioteca e a fila de envio, com dados
// fixos. Os dois diálogos abrem por teclado, prendem o foco, fecham com Esc e devolvem o foco a
// quem abriu; a fila mostra cada estado em texto, a barra só no envio e um anúncio só.

/** Tab e Shift+Tab repetidos não saem do diálogo. */
async function expectFocusTrapped(page: Page, dialog: Locator): Promise<void> {
  for (const key of ['Tab', 'Shift+Tab'] as const) {
    for (let step = 0; step < 4; step += 1) {
      await page.keyboard.press(key);
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(
        true,
      );
    }
  }
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`MediaPicker: abre por teclado, pagina, escolhe, Esc fecha e sem violação do axe (${colorScheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await login(page);
    const hydration = hydrationMessages(page);
    await page.goto(SHOWCASE);
    await page.waitForLoadState('networkidle');
    const picker = section(page, 'MediaPicker');

    const closed = await new AxeBuilder({ page })
      .withTags(WCAG)
      .include('[aria-labelledby="vitrine-media-picker"]')
      .analyze();
    expect(closed.violations).toEqual([]);

    const opener = picker.getByRole('button', { name: 'Escolher imagem' });
    await tabTo(page, opener);
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Escolher imagem' });
    const status = dialog.getByRole('status');
    await expect(status).toHaveText('Página 1 de 3 · 30 imagens');
    const grid = dialog.getByRole('list', { name: 'Imagens da biblioteca' });
    await expect(grid.getByRole('listitem')).toHaveCount(12);
    await expectFocusTrapped(page, dialog);

    const open = await audit(page);
    expect(open.violations).toEqual([]);

    await tabTo(page, dialog.getByRole('button', { name: 'Próxima página' }));
    await page.keyboard.press('Enter');
    await expect(status).toHaveText('Página 2 de 3 · 30 imagens');
    await expect(dialog.getByRole('button', { name: 'Página 2' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    const tile = grid.getByRole('button', { name: 'Mídia 13 · 480×320', exact: true });
    await tabTo(page, tile);
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    await expect(picker.getByText('Escolhida: Mídia 13 · 480×320')).toBeVisible();

    await page.keyboard.press('Enter');
    await expect(status).toHaveText('Página 1 de 3 · 30 imagens');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(hydration).toEqual([]);
  });
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`MediaDetails: a miniatura abre os dados por teclado, Esc devolve o foco e sem violação do axe (${colorScheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await login(page);
    await page.goto(SHOWCASE);
    await page.waitForLoadState('networkidle');
    const details = section(page, 'MediaDetails');
    const name = 'capa-da-materia-sobre-o-festival-de-inverno-de-2026-na-serra.jpg';

    const closed = await new AxeBuilder({ page })
      .withTags(WCAG)
      .include('[aria-labelledby="vitrine-media-details"]')
      .analyze();
    expect(closed.violations).toEqual([]);

    const tile = details.getByRole('button', { name: new RegExp(`^${name} · `) });
    await expect(tile).toHaveAttribute('aria-haspopup', 'dialog');
    await tabTo(page, tile);
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name });
    await expect(dialog.getByRole('heading', { name })).toBeVisible();
    await expect(dialog.getByText('1200×800 px')).toBeVisible();
    await expect(dialog.getByText('AVIF, JPEG, WebP')).toBeVisible();
    await expectFocusTrapped(page, dialog);

    const open = await audit(page);
    expect(open.violations).toEqual([]);

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(tile).toBeFocused();

    // Sem envio registrado: o nome e a data de reserva.
    const fallback = details.getByRole('button', { name: /^Sem nome \(Mídia 42\) · / });
    await tabTo(page, fallback);
    await page.keyboard.press('Enter');
    const unnamed = page.getByRole('dialog', { name: 'Sem nome (Mídia 42)' });
    await expect(unnamed.getByText('Data de envio não registrada')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(unnamed).toHaveCount(0);
    await expect(fallback).toBeFocused();
  });
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`Fila de envio: um estado por arquivo, barra só no envio, um anúncio e sem violação do axe (${colorScheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await login(page);
    await page.goto(SHOWCASE);
    await page.waitForLoadState('networkidle');
    const queue = section(page, 'Fila de envio');

    await expect(queue.getByRole('status')).toHaveCount(1);
    await expect(queue.getByRole('status')).toHaveText(
      'Só as 20 primeiras imagens foram enviadas; envie as outras em seguida. 6 envios: 1 aguardando, 1 enviando, 1 processando, 1 pronta, 1 recusada, 1 ainda processando',
    );
    const items = queue.getByRole('list', { name: 'Envios' }).getByRole('listitem');
    await expect(items).toHaveCount(6);
    await expect(items.nth(4)).toContainText('recusada: formato não aceito');
    await expect(items.nth(5)).toContainText('ainda processando; recarregue a página mais tarde');

    const bar = queue.getByRole('progressbar');
    await expect(bar).toHaveCount(1);
    await expect(bar).toHaveAccessibleName('Envio de galeria-01.png');
    await expect(bar).toHaveAttribute('aria-valuenow', '42');

    const accessibility = await new AxeBuilder({ page })
      .withTags(WCAG)
      .include('[aria-labelledby="vitrine-fila-de-envio"]')
      .analyze();
    expect(accessibility.violations).toEqual([]);
  });
}

// Cabeçalho de página e peças de estado (#388): a trilha nomeada com o item atual em
// aria-current, as seis cores do StateTag, a etapa atual do ciclo com aria-current="step" e a
// ação na etapa seguinte. Por tema, o foco de 2px no --ring nos links e nas ações, e o axe em
// cada seção. O foco parte do h2 da seção: a vitrine tem mais paradas de Tab que o `tabTo` dá.
const STATES_SECTIONS = ['PageHeader', 'StatusScreen', 'StateTag', 'LifecycleSteps'] as const;

/** Põe o foco no h2 da seção, para o próximo Tab entrar nela. */
async function focusSection(page: Page, id: string): Promise<void> {
  await page.locator(`#${id}`).evaluate((heading) => {
    heading.setAttribute('tabindex', '-1');
    (heading as HTMLElement).focus();
  });
}

test('cabeçalho e estados: trilha, status em seis cores e ciclo com a etapa atual', async ({
  page,
}) => {
  await login(page);
  await page.goto(SHOWCASE);
  await page.waitForLoadState('networkidle');

  const header = section(page, 'PageHeader');
  const trail = header.getByRole('navigation', { name: 'Trilha de navegação' });
  await expect(trail.getByRole('listitem')).toHaveCount(3);
  await expect(trail.getByRole('link')).toHaveText(['Sites', 'Portal Exemplo']);
  await expect(trail.getByText('Mudanças pendentes')).toHaveAttribute('aria-current', 'page');
  await expect(header.getByRole('heading', { level: 1, name: 'Mudanças pendentes' })).toBeVisible();
  await expect(header.getByRole('link', { name: 'Criar conteúdo' })).toBeVisible();

  const status = section(page, 'StatusScreen');
  const screen = status.getByRole('region', { name: 'Página não encontrada' });
  await expect(screen.getByRole('heading', { level: 1 })).toHaveText('Página não encontrada');
  await expect(screen.locator('svg[aria-hidden="true"]')).toHaveCount(1);
  await expect(screen.getByRole('link', { name: 'Voltar para os sites' })).toBeVisible();

  const tags = section(page, 'StateTag').getByRole('listitem');
  await expect(tags).toHaveText([
    'Rascunho',
    'Em revisão',
    'Aprovado',
    'Agendado',
    'Publicado',
    'Despublicado',
  ]);
  const dots = await tags.evaluateAll((items) =>
    items.map((item) => getComputedStyle(item.querySelector('.tag-affix')!).backgroundColor),
  );
  expect(new Set(dots).size).toBe(6);

  const steps = section(page, 'LifecycleSteps');
  const [withAction, done] = await steps.getByRole('list').all();
  await expect(withAction!.locator('[aria-current="step"]')).toContainText('Infra aplicada');
  await expect(withAction!.getByRole('button', { name: 'Avançar etapa' })).toBeVisible();
  await expect(done!.locator('[aria-current="step"]')).toContainText('Publicado');
  await expect(done!.getByRole('button')).toHaveCount(0);

  // A ação avança a etapa até a última, onde some.
  const advance = steps.getByRole('button', { name: 'Avançar etapa' });
  await advance.click();
  await expect(withAction!.locator('[aria-current="step"]')).toContainText('Zona ativa');
  await advance.click();
  await expect(withAction!.locator('[aria-current="step"]')).toContainText('Publicado');
  await expect(steps.getByRole('button')).toHaveCount(0);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`cabeçalho e estados pelo teclado, com foco de 2px e sem violação do axe (${colorScheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await login(page);
    const hydration = hydrationMessages(page);
    await page.goto(SHOWCASE);
    await page.waitForLoadState('networkidle');
    const ring = await ringColor(page);

    const header = section(page, 'PageHeader');
    await focusSection(page, 'vitrine-page-header');
    for (const target of [
      header.getByRole('link', { name: 'Sites' }),
      header.getByRole('link', { name: 'Portal Exemplo' }),
      header.getByRole('link', { name: 'Criar conteúdo' }),
    ]) {
      await page.keyboard.press('Tab');
      await expect(target).toBeFocused();
      expect(await outline(target)).toEqual({ color: ring, style: 'solid', width: '2px' });
    }

    const back = section(page, 'StatusScreen').getByRole('link', { name: 'Voltar para os sites' });
    await focusSection(page, 'vitrine-status-screen');
    await page.keyboard.press('Tab');
    await expect(back).toBeFocused();
    expect(await outline(back)).toEqual({ color: ring, style: 'solid', width: '2px' });

    const steps = section(page, 'LifecycleSteps');
    const advance = steps.getByRole('button', { name: 'Avançar etapa' });
    await focusSection(page, 'vitrine-lifecycle-steps');
    await page.keyboard.press('Tab');
    await expect(advance).toBeFocused();
    expect(await outline(advance)).toEqual({ color: ring, style: 'solid', width: '2px' });
    await page.keyboard.press('Enter');
    await expect(steps.getByRole('list').first().locator('[aria-current="step"]')).toContainText(
      'Zona ativa',
    );

    for (const id of [
      'vitrine-page-header',
      'vitrine-status-screen',
      'vitrine-state-tag',
      'vitrine-lifecycle-steps',
    ]) {
      const accessibility = await new AxeBuilder({ page })
        .withTags(WCAG)
        .include(`[aria-labelledby="${id}"]`)
        .analyze();
      expect(accessibility.violations, id).toEqual([]);
    }
    for (const name of STATES_SECTIONS) {
      await expect(section(page, name).getByRole('heading', { level: 2 })).toHaveText(name);
    }
    expect(hydration).toEqual([]);
  });
}

// Formulário e moldura (#390): o `SchemaForm` de tela e em cartão, o rich text com o popover de
// link e a data no fuso do site (registrados pelo `fields`, como nas telas) e o `SiteSwitcher`
// aberto e recolhido. Cada seção pelo teclado e com o axe nos dois temas, no estado aberto. O
// foco começa no controle (`focus()`): com tantas seções antes, o Tab passaria do `tabTo`.

/** Axe só numa seção da vitrine, e no menu ou painel que ela abriu num portal. */
const auditSection = (page: Page, id: string, ...extra: string[]) => {
  const builder = new AxeBuilder({ page })
    .withTags(WCAG)
    .include(`[aria-labelledby="${id}"]`)
    .exclude('[data-floating-ui-focus-guard]');
  for (const selector of extra) builder.include(selector);
  return builder.analyze();
};

for (const colorScheme of ['light', 'dark'] as const) {
  test(`SchemaForm de tela e em cartão pelo teclado: erro no campo, resumo e toast, sem violação do axe (${colorScheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await login(page);
    const hydration = hydrationMessages(page);
    await page.goto(SHOWCASE);
    await page.waitForLoadState('networkidle');
    const forms = section(page, 'SchemaForm');

    // De tela: título obrigatório vazio; Enter no envio marca o campo, leva o foco a ele e
    // lista o erro no resumo, que leva de volta ao campo.
    const create = forms.getByRole('button', { name: 'Criar matéria' });
    await expect(forms.getByRole('button', { name: 'Descartar' })).toBeVisible();
    await create.focus();
    await page.keyboard.press('Enter');
    const title = forms.getByRole('textbox', { name: 'Título' }).first();
    await expect(title).toHaveAttribute('aria-invalid', 'true');
    await expect(title).toHaveAccessibleDescription('Informe o título');
    await expect(title).toBeFocused();
    const summary = forms.getByRole('button', { name: 'Título: Informe o título' });
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(title).toBeFocused();

    expect((await auditSection(page, 'vitrine-schema-form')).violations).toEqual([]);

    await page.keyboard.type('Nova matéria');
    await create.focus();
    await page.keyboard.press('Enter');
    await expect(toastRegion(page).getByText('Matéria criada.')).toBeVisible();
    await expect(title).toHaveAttribute('aria-invalid', 'false');

    // Em cartão: apagar o título e enviar com Enter no próprio campo.
    const cardTitle = forms.getByRole('textbox', { name: 'Título' }).last();
    await expect(cardTitle).toHaveValue('Matéria de exemplo');
    await expect(forms.getByRole('checkbox', { name: 'Destaque na capa' }).last()).toBeChecked();
    await cardTitle.focus();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Enter');
    await expect(cardTitle).toHaveAttribute('aria-invalid', 'true');
    await expect(cardTitle).toBeFocused();
    await page.keyboard.type('Outra matéria');
    await page.keyboard.press('Enter');
    await expect(toastRegion(page).getByText('Matéria salva.')).toBeVisible();

    expect(hydration).toEqual([]);
  });
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`rich text: o popover de link aplica o endereço pelo teclado e o Esc volta ao editor, sem violação do axe (${colorScheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await login(page);
    const hydration = hydrationMessages(page);
    await page.goto(SHOWCASE);
    await page.waitForLoadState('networkidle');
    const rich = section(page, 'Rich text e link');
    const editor = rich.getByRole('textbox', { name: 'Corpo do texto' });
    const toolbar = rich.getByRole('toolbar', { name: 'Formatação: Corpo do texto' });
    const linkButton = toolbar.getByRole('button', { name: 'Link', exact: true });
    const address = rich.getByRole('textbox', { name: 'Endereço do link' });

    // Seleciona a palavra "link" pelo teclado e abre o popover pelo botão da barra. O link fica
    // dentro da frase (alvo em linha, exceção do 2.5.8).
    await expect(editor).toHaveText('Texto de exemplo para o link.');
    // O ProseMirror lê a seleção do DOM no `selectionchange`, e uma tecla que chega antes dele
    // se perde (o link entrava com o endereço no início do texto): repete o gesto até o estado
    // do editor (o Tiptap o expõe em `dom.editor`) ser a palavra.
    await expect(async () => {
      await editor.focus();
      // Fim do texto sem o End (no macOS ele só rola): seleciona tudo e recolhe para a direita.
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowLeft');
      for (let step = 0; step < 4; step += 1) await page.keyboard.press('Shift+ArrowLeft');
      await expect
        .poll(
          () =>
            editor.evaluate((dom) => {
              const { state } = (dom as HTMLElement & { editor: Editor }).editor;
              return state.doc.textBetween(state.selection.from, state.selection.to);
            }),
          { timeout: 1000 },
        )
        .toBe('link');
    }).toPass({ timeout: 10_000 });
    await linkButton.focus();
    await page.keyboard.press('Enter');
    await expect(address).toBeVisible();
    await expect(address).toBeFocused();
    await expect(address).toHaveValue('');

    // Endereço inválido: o erro fica no campo do popover, que continua aberto.
    await page.keyboard.type('exemplo');
    await page.keyboard.press('Enter');
    await expect(address).toHaveAttribute('aria-invalid', 'true');
    await expect(address).toBeVisible();
    expect((await auditSection(page, 'vitrine-rich-text')).violations).toEqual([]);

    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('https://exemplo.com/guia');
    await page.keyboard.press('Enter');
    await expect(address).toBeHidden();
    await expect(editor).toBeFocused();
    await expect(editor.getByRole('link', { name: 'link', exact: true })).toHaveAttribute(
      'href',
      'https://exemplo.com/guia',
    );
    await expect(linkButton).toHaveAttribute('aria-pressed', 'true');

    // Com o cursor no link, o popover reabre com o endereço e "Remover link"; Esc fecha e
    // devolve o foco ao editor.
    await linkButton.focus();
    await page.keyboard.press('Enter');
    await expect(address).toHaveValue('https://exemplo.com/guia');
    await expect(rich.getByRole('button', { name: 'Remover link' })).toBeVisible();
    expect((await auditSection(page, 'vitrine-rich-text')).violations).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(address).toBeHidden();
    await expect(editor).toBeFocused();

    await rich.getByRole('button', { name: 'Salvar texto' }).focus();
    await page.keyboard.press('Enter');
    await expect(toastRegion(page).getByText('Texto salvo.')).toBeVisible();

    expect(hydration).toEqual([]);
  });
}

test.describe('data com fuso no SchemaForm', () => {
  // Navegador em UTC: o campo mostra a hora de parede de São Paulo, o fuso do site.
  test.use({ timezoneId: 'UTC' });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`data com fuso pelo teclado, sem violação do axe com o painel aberto (${colorScheme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await login(page);
      const hydration = hydrationMessages(page);
      await page.goto(SHOWCASE);
      await page.waitForLoadState('networkidle');
      const agenda = section(page, 'Data com fuso');
      const field = agenda.getByRole('combobox', { name: 'Publicar em' });
      const panel = page.getByRole('dialog', { name: 'Escolher data e hora' });
      await expect(field).toHaveValue('15/07/2026 13:00');
      await expect(field).toHaveAccessibleDescription('Hora de São Paulo, o fuso do site.');

      await field.focus();
      await page.keyboard.press('Enter');
      await expect(panel).toBeVisible();
      await expect
        .poll(() => panel.evaluate((element) => element.contains(document.activeElement)))
        .toBe(true);
      await expect(
        panel.getByRole('button', { name: '15 de julho de 2026', pressed: true }),
      ).toBeVisible();
      expect((await auditSection(page, 'vitrine-data-fuso')).violations).toEqual([]);

      await page.keyboard.press('Escape');
      await expect(panel).toBeHidden();
      await expect(field).toBeFocused();

      await agenda.getByRole('button', { name: 'Agendar' }).focus();
      await page.keyboard.press('Enter');
      await expect(toastRegion(page).getByText('Publicação agendada.')).toBeVisible();

      expect(hydration).toEqual([]);
    });
  }
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`SiteSwitcher aberto e recolhido pelo teclado: setas, site atual e Esc, sem violação do axe (${colorScheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await login(page);
    const hydration = hydrationMessages(page);
    await page.goto(SHOWCASE);
    await page.waitForLoadState('networkidle');
    const switchers = section(page, 'SiteSwitcher');
    const menu = page.getByRole('menu');

    for (const current of ['Receitas da Vó', 'Viagem Leve']) {
      const button = switchers.getByRole('button', { name: `${current}, trocar de site` });
      await button.focus();
      await page.keyboard.press('Enter');
      await expect(menu).toBeVisible();
      await expect(menu.getByRole('menuitem')).toHaveText([
        'Receitas da Vó',
        'Viagem Leve',
        'Casa e Jardim',
      ]);
      await expect(menu.locator('[aria-current="true"]')).toHaveText(current);
      // Como nos outros menus da moldura, o foco abre no primeiro item e anda pelas setas.
      await expect(menu.getByRole('menuitem').first()).toBeFocused();
      await page.keyboard.press('ArrowDown');
      const viagem = menu.getByRole('menuitem', { name: 'Viagem Leve' });
      await expect(viagem).toBeFocused();
      await expect(viagem).toHaveAttribute('href', '/sites/viagem-leve');

      // A transição de abertura (200 ms, no <ul>) mistura a cor do texto com o fundo enquanto a
      // opacidade sobe; o axe roda depois dela.
      await expect(page.locator('.dropdown-menu')).toHaveCSS('opacity', '1');
      expect(
        (await auditSection(page, 'vitrine-site-switcher', '[role="menu"]')).violations,
      ).toEqual([]);

      await page.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);
      await expect(button).toBeFocused();
    }

    // Recolhido: as iniciais na tela, o nome na dica do foco.
    const collapsed = switchers.getByRole('button', { name: 'Viagem Leve, trocar de site' });
    await expect(collapsed).toHaveText(/^VL/);
    await expect(page.getByRole('tooltip')).toHaveText('Viagem Leve');

    expect(hydration).toEqual([]);
  });
}
