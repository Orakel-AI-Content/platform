import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import { THEME_COOKIE } from '../../src/configs/theme.config.ts';
import { asRole } from './auth.ts';

// Tema por classe no <html> (#203): com cookie, a classe vem no HTML do servidor; sem cookie,
// o script do <head> aplica a preferência do sistema antes da primeira pintura. Nenhum quadro
// sai no tema oposto, e a hidratação não reclama da classe posta pelo script.
// A persistência da troca pelo header (#240) está no fim do arquivo.

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

// Troca pelo header (#240): a escolha persiste pelo cookie, que o servidor lê. Com o sistema
// claro, Escuro faz o HTML do servidor já trazer a classe, e a recarga não pisca nem reclama na
// hidratação, também nas outras telas; Sistema apaga o cookie e volta ao sistema. A troca na
// hora, o item marcado, o teclado e o axe do menu ficam no teste de componente
// (`ThemeSwitcher.browser.test.tsx`, #476).

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

test('a escolha no header persiste no servidor e na recarga; Sistema apaga o cookie', async ({
  page,
  context,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await asRole(page, 'editor');
  await page.waitForLoadState('networkidle');
  await expect(themeButton(page)).toHaveAccessibleName('Tema: Sistema');

  await choose(page, 'Escuro');
  expect(await themeCookieValue(context)).toBe('dark');
  expect(await serverHtmlTag(page)).toMatch(/class="[^"]*\bdark\b/);
  await expectReloadIn(page, 'dark');
  await expect(themeButton(page)).toHaveAccessibleName('Tema: Escuro');

  // Vale nas outras telas.
  await page.goto('/sites/exemplo-a/conteudos');
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  expect(await darkUtilityDisplay(page)).toBe(EXPECTED_DISPLAY.dark);

  await page.goto('/sites');
  await page.waitForLoadState('networkidle');
  await choose(page, 'Sistema');
  await expect(page.locator('html')).toHaveClass(/\blight\b/);
  expect(await themeCookieValue(context)).toBeUndefined();
  expect(await serverHtmlTag(page)).not.toMatch(/\b(dark|light)\b/);
  await expectReloadIn(page, 'light');
  await expect(themeButton(page)).toHaveAccessibleName('Tema: Sistema');
});
