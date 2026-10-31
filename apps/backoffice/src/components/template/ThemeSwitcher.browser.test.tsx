import { afterEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { cookieThemeMode, themeCookie } from '@/configs/theme.config';

import {
  audit,
  COLOR_SCHEMES,
  setReducedMotion,
  setTheme,
  type ColorScheme,
} from '../../../test/browser/a11y.ts';
import { renderUi } from '../../../test/browser/render.tsx';
import ThemeSwitcher from './ThemeSwitcher';

// Troca de tema do cabeçalho em Chromium (#476; antes no E2E, `theme.spec.ts`, #240): com o
// sistema num tema, Claro ou Escuro trocam a classe do <html> na hora (as utilities `dark:`
// seguem), gravam o cookie e passam a ser o item marcado; Sistema apaga o cookie e volta à
// preferência do sistema. O menu abre pelo teclado e fica sem violação do axe nos dois temas. O
// HTML do servidor com a classe e a recarga sem piscar ficam no E2E.

const LABEL: Record<ColorScheme, string> = { light: 'Claro', dark: 'Escuro' };
const opposite = (scheme: ColorScheme): ColorScheme => (scheme === 'dark' ? 'light' : 'dark');

const button = () => page.getByRole('button', { name: /^Tema: / });
const menu = () => page.getByRole('menu');
const option = (name: string) => menu().getByRole('menuitemradio', { name });
const html = () => document.documentElement.classList;

/** Uma utility `dark:` num elemento de teste: `block` no claro, `none` no escuro. */
function darkUtilityDisplay(): string {
  const probe = document.createElement('div');
  probe.className = 'block dark:hidden';
  document.body.append(probe);
  const display = getComputedStyle(probe).display;
  probe.remove();
  return display;
}

const EXPECTED_DISPLAY: Record<ColorScheme, string> = { light: 'block', dark: 'none' };

/** O menu fica opaco depois da transição de abertura (no <ul>). */
const menuSettled = () =>
  getComputedStyle(document.querySelector('.dropdown-menu')!).opacity === '1';

async function choose(label: string): Promise<void> {
  await button().click();
  await option(label).click();
  await expect.element(menu()).not.toBeInTheDocument();
  await expect.element(button()).toHaveAccessibleName(`Tema: ${label}`);
}

afterEach(() => {
  document.cookie = themeCookie('system');
});

describe.each(COLOR_SCHEMES)('ThemeSwitcher no navegador (sistema %s)', (scheme) => {
  const chosen = opposite(scheme);

  it(`escolher ${LABEL[chosen]} muda na hora e grava o cookie; Sistema o apaga e volta ao sistema`, async () => {
    await setTheme(scheme);
    await renderUi(<ThemeSwitcher initialMode={undefined} />);
    await expect.element(button()).toHaveAccessibleName('Tema: Sistema');

    await choose(LABEL[chosen]);
    expect(html().contains(chosen)).toBe(true);
    expect(html().contains(scheme)).toBe(false);
    expect(darkUtilityDisplay()).toBe(EXPECTED_DISPLAY[chosen]);
    expect(cookieThemeMode(document.cookie)).toBe(chosen);

    // O atual é anunciado como marcado.
    await button().click();
    await expect.element(option(LABEL[chosen])).toHaveAttribute('aria-checked', 'true');
    await expect.element(option('Sistema')).toHaveAttribute('aria-checked', 'false');
    await userEvent.keyboard('{Escape}');
    await expect.element(menu()).not.toBeInTheDocument();

    await choose('Sistema');
    expect(html().contains(scheme)).toBe(true);
    expect(html().contains(chosen)).toBe(false);
    expect(darkUtilityDisplay()).toBe(EXPECTED_DISPLAY[scheme]);
    expect(cookieThemeMode(document.cookie)).toBeUndefined();
  });

  it('abre pelo teclado, Esc devolve o foco, e o menu aberto fica sem violação do axe', async () => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    await renderUi(
      <header className="header">
        <ThemeSwitcher initialMode={scheme} />
      </header>,
    );
    (button().element() as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    await expect.element(menu()).toBeVisible();
    await expect.element(option(LABEL[scheme])).toHaveAttribute('aria-checked', 'true');
    // Depois da transição de abertura (opacidade), como no menu de perfil (#239).
    await expect.poll(menuSettled).toBe(true);
    expect(await audit(document.querySelector('.header')!, menu())).toEqual([]);

    await userEvent.keyboard('{Escape}');
    await expect.element(menu()).not.toBeInTheDocument();
    await expect.element(button()).toHaveFocus();
  });
});
