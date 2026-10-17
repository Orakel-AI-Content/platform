import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

// Vitrine dos componentes do Ecme (#205; workspace#45): cada componente portado auditado com
// axe e teclado nos dois temas, renderizado no servidor sem aviso de hidratação. Com movimento
// reduzido, o MotionConfig do layout desliga as animações de transform do `motion`.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag22aa'];
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

/** Leva o foco até o controle só com Tab (no máximo 60 passos). */
async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let step = 0; step < 60; step += 1) {
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

    const accessibility = await new AxeBuilder({ page }).withTags(WCAG).analyze();
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
  const accessibility = await new AxeBuilder({ page }).withTags(WCAG).analyze();
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
