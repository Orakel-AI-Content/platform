import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import { THEME_COOKIE } from '../../src/configs/theme.config.ts';
import { asRole } from './auth.ts';

// Tema por classe no <html> (#203): com cookie, a classe vem no HTML do servidor; sem cookie,
// o script do <head> aplica a preferência do sistema antes da primeira pintura. Nenhum quadro
// sai no tema oposto, e a hidratação não reclama da classe posta pelo script.
// A troca pelo header (#240) está no fim do arquivo.

const SCHEMES = ['light', 'dark'] as const;
type Scheme = (typeof SCHEMES)[number];

/** Fundo do body de cada tema no globals.css: neutral (#ffffff) e gray-950 (#0a0a0a). */
const BACKGROUND: Record<Scheme, string> = {
  light: 'rgb(255, 255, 255)',
  dark: 'rgb(10, 10, 10)',
};

const opposite = (scheme: Scheme): Scheme => (scheme === 'dark' ? 'light' : 'dark');

async function setThemeCookie(context: BrowserContext, value: string): Promise<void> {
  const url = test.info().project.use.baseURL ?? 'https://admin.orakel.localhost';
  await context.addCookies([{ name: THEME_COOKIE, value, url }]);
}

type Frame = { theme: string; background: string | null };

/**
 * Registra, a cada quadro desde o início do documento (antes de qualquer script da página), a
 * classe de tema do <html> e o fundo do <body>: o primeiro `requestAnimationFrame` roda antes
 * da primeira pintura.
 */
async function recordFrames(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const frames: Frame[] = [];
    (window as unknown as { themeFrames: Frame[] }).themeFrames = frames;
    const record = () => {
      const classes = document.documentElement.classList;
      frames.push({
        theme: ['dark', 'light'].filter((name) => classes.contains(name)).join(' '),
        background: document.body ? getComputedStyle(document.body).backgroundColor : null,
      });
      if (frames.length < 30) requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
  });
}

async function frames(page: Page): Promise<Frame[]> {
  await page.waitForFunction(
    () => (window as unknown as { themeFrames: Frame[] }).themeFrames.length >= 30,
  );
  return page.evaluate(() => (window as unknown as { themeFrames: Frame[] }).themeFrames);
}

/** Erros e avisos de hidratação (em produção, os erros minificados #418, #423 e #425). */
function hydrationMessages(page: Page): string[] {
  const messages: string[] = [];
  page.on('console', (message) => {
    if (/hydrat|#418|#423|#425/i.test(message.text())) messages.push(message.text());
  });
  page.on('pageerror', (error) => {
    if (/hydrat|#418|#423|#425/i.test(error.message)) messages.push(error.message);
  });
  return messages;
}

/** A classe de tema no <html> do HTML vindo do servidor, antes de qualquer script. */
async function serverHtmlTag(page: Page): Promise<string> {
  const response = await page.request.get('/sites');
  expect(response.ok()).toBe(true);
  return /<html[^>]*>/.exec(await response.text())?.[0] ?? '';
}

/** Uma utility `dark:` (gerada pelo Tailwind a partir deste arquivo) num elemento injetado. */
async function darkUtilityDisplay(page: Page): Promise<string> {
  return page.evaluate(() => {
    const probe = document.createElement('div');
    probe.className = 'block dark:hidden';
    document.body.append(probe);
    const display = getComputedStyle(probe).display;
    probe.remove();
    return display;
  });
}

const EXPECTED_DISPLAY: Record<Scheme, string> = { light: 'block', dark: 'none' };

for (const scheme of SCHEMES) {
  test(`sem cookie, o sistema ${scheme} vale desde a primeira pintura, sem quadro no tema oposto`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await asRole(page, 'editor');
    const hydration = hydrationMessages(page);
    await recordFrames(page);

    await page.goto('/sites');
    await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();

    const recorded = await frames(page);
    expect(recorded[0]?.theme).toBe(scheme);
    for (const frame of recorded) {
      expect(frame.theme).toBe(scheme);
      if (frame.background !== null) expect(frame.background).toBe(BACKGROUND[scheme]);
    }
    expect(recorded.some((frame) => frame.background === BACKGROUND[scheme])).toBe(true);
    expect(await darkUtilityDisplay(page)).toBe(EXPECTED_DISPLAY[scheme]);

    // O HTML do servidor não traz classe de tema: quem a põe é o script.
    const tag = await serverHtmlTag(page);
    expect(tag).not.toMatch(/\b(dark|light)\b/);
    expect(hydration).toEqual([]);
  });

  test(
    `com cookie ${scheme}, o HTML do servidor já traz a classe, mesmo com o sistema no oposto`,
    { tag: '@smoke' },
    async ({ page, context }) => {
      await page.emulateMedia({ colorScheme: opposite(scheme) });
      await asRole(page, 'editor');
      await setThemeCookie(context, scheme);
      const hydration = hydrationMessages(page);

      const tag = await serverHtmlTag(page);
      expect(tag).toMatch(new RegExp(`class="[^"]*\\b${scheme}\\b`));
      expect(tag).not.toMatch(new RegExp(`\\b${opposite(scheme)}\\b`));

      await recordFrames(page);
      await page.goto('/sites');
      await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();
      for (const frame of await frames(page)) {
        expect(frame.theme).toBe(scheme);
        if (frame.background !== null) expect(frame.background).toBe(BACKGROUND[scheme]);
      }
      expect(await darkUtilityDisplay(page)).toBe(EXPECTED_DISPLAY[scheme]);
      expect(hydration).toEqual([]);
    },
  );
}

test('cookie com valor desconhecido vale como modo sistema', async ({ page, context }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await asRole(page, 'editor');
  await setThemeCookie(context, 'sepia');

  const tag = await serverHtmlTag(page);
  expect(tag).not.toMatch(/\b(dark|light|sepia)\b/);

  await page.goto('/sites');
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  expect(await darkUtilityDisplay(page)).toBe('none');
});

// Troca pelo header (#240): Claro e Escuro gravam o cookie e trocam a classe na hora; Sistema
// apaga o cookie. Ao recarregar, nenhum quadro sai no tema oposto e a hidratação não reclama.

const LABEL: Record<Scheme, string> = { light: 'Claro', dark: 'Escuro' };

const themeButton = (page: Page) => page.getByRole('button', { name: /^Tema: / });

async function choose(page: Page, label: string): Promise<void> {
  await themeButton(page).click();
  await page.getByRole('menuitemradio', { name: label }).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(themeButton(page)).toHaveAccessibleName(`Tema: ${label}`);
}

async function themeCookieValue(context: BrowserContext): Promise<string | undefined> {
  return (await context.cookies()).find((cookie) => cookie.name === THEME_COOKIE)?.value;
}

/** Recarrega gravando os quadros: todos no tema dado, sem aviso de hidratação. */
async function expectReloadIn(page: Page, scheme: Scheme): Promise<void> {
  const hydration = hydrationMessages(page);
  await recordFrames(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();
  const recorded = await frames(page);
  expect(recorded[0]?.theme).toBe(scheme);
  for (const frame of recorded) {
    expect(frame.theme).toBe(scheme);
    if (frame.background !== null) expect(frame.background).toBe(BACKGROUND[scheme]);
  }
  await page.waitForLoadState('networkidle');
  expect(hydration).toEqual([]);
}

for (const scheme of SCHEMES) {
  const chosen = opposite(scheme);

  test(`com o sistema ${scheme}, escolher ${LABEL[chosen]} no header muda na hora e persiste`, async ({
    page,
    context,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await asRole(page, 'editor');
    await page.waitForLoadState('networkidle');
    await expect(themeButton(page)).toHaveAccessibleName('Tema: Sistema');

    await choose(page, LABEL[chosen]);
    await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${chosen}\\b`));
    await expect(page.locator('html')).not.toHaveClass(new RegExp(`\\b${scheme}\\b`));
    expect(await darkUtilityDisplay(page)).toBe(EXPECTED_DISPLAY[chosen]);
    expect(await themeCookieValue(context)).toBe(chosen);

    // O atual é anunciado como marcado.
    await themeButton(page).click();
    await expect(page.getByRole('menuitemradio', { name: LABEL[chosen] })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByRole('menuitemradio', { name: 'Sistema' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await page.keyboard.press('Escape');

    // Persiste: o HTML do servidor já traz a classe, e a recarga não pisca.
    const tag = await serverHtmlTag(page);
    expect(tag).toMatch(new RegExp(`class="[^"]*\\b${chosen}\\b`));
    await expectReloadIn(page, chosen);
    await expect(themeButton(page)).toHaveAccessibleName(`Tema: ${LABEL[chosen]}`);

    // Vale nas outras telas.
    await page.goto('/sites/exemplo-a/conteudos');
    await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${chosen}\\b`));
    expect(await darkUtilityDisplay(page)).toBe(EXPECTED_DISPLAY[chosen]);
  });
}

test('escolher Sistema no header apaga o cookie e volta à preferência do sistema', async ({
  page,
  context,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await asRole(page, 'editor');
  await setThemeCookie(context, 'light');
  await page.goto('/sites');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('html')).toHaveClass(/\blight\b/);
  await expect(themeButton(page)).toHaveAccessibleName('Tema: Claro');

  await choose(page, 'Sistema');
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  await expect(page.locator('html')).not.toHaveClass(/\blight\b/);
  expect(await themeCookieValue(context)).toBeUndefined();

  const tag = await serverHtmlTag(page);
  expect(tag).not.toMatch(/\b(dark|light)\b/);
  await expectReloadIn(page, 'dark');
  await expect(themeButton(page)).toHaveAccessibleName('Tema: Sistema');
});

for (const colorScheme of SCHEMES) {
  test(`o menu de tema aberto sem violação do axe (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await asRole(page, 'editor');
    await page.waitForLoadState('networkidle');
    await themeButton(page).click();
    await expect(page.getByRole('menu')).toBeVisible();
    // Depois da transição de abertura (opacidade), como no menu de perfil (#239).
    await expect(page.locator('.dropdown-menu')).toHaveCSS('opacity', '1');

    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .include('.header')
      .include('[role="menu"]')
      .exclude('[data-floating-ui-focus-guard]')
      .analyze();
    expect(accessibility.violations).toEqual([]);
  });
}
