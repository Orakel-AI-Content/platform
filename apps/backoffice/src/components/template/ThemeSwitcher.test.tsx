// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ThemeMode } from '@/configs/theme.config';

import ThemeSwitcher from './ThemeSwitcher.tsx';

// Troca de tema (#240): gatilho com nome acessível, o modo atual marcado (`aria-checked`) e o
// efeito de cada escolha no cookie e na classe do <html>.

const cookieWrites: string[] = [];
let prefersDark = false;

beforeEach(() => {
  cookieWrites.length = 0;
  prefersDark = false;
  document.documentElement.className = '';
  vi.spyOn(document, 'cookie', 'set').mockImplementation((value: string) => {
    cookieWrites.push(value);
  });
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) => ({ matches: prefersDark, media: query }) as MediaQueryList,
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const renderSwitcher = (initialMode: ThemeMode | undefined) =>
  render(
    <header>
      <ThemeSwitcher initialMode={initialMode} />
    </header>,
  );

const toggle = () => screen.getByRole('button', { name: /^Tema: / });

async function open() {
  await userEvent.click(toggle());
  return screen.findAllByRole('menuitemradio');
}

function checked(): string[] {
  return screen
    .getAllByRole('menuitemradio')
    .filter((item) => item.getAttribute('aria-checked') === 'true')
    .map((item) => item.textContent ?? '');
}

describe('ThemeSwitcher', () => {
  it.each([
    ['light', 'Claro'],
    ['dark', 'Escuro'],
    [undefined, 'Sistema'],
  ] as const)('modo inicial %s: nome "Tema: %s" e o item marcado', async (mode, label) => {
    renderSwitcher(mode);

    expect(screen.getByRole('button', { name: `Tema: ${label}` })).toBe(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    const items = await open();
    expect(items.map((item) => item.textContent)).toEqual(['Claro', 'Escuro', 'Sistema']);
    expect(checked()).toEqual([label]);
  });

  it('Escuro grava o cookie, troca a classe do <html> e passa a ser o marcado', async () => {
    document.documentElement.className = 'font-var light';
    renderSwitcher(undefined);

    await open();
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Escuro' }));

    expect(cookieWrites).toEqual(['orakel-theme=dark; Path=/; Max-Age=31536000; SameSite=Lax']);
    expect(document.documentElement.className).toBe('font-var dark');
    await waitFor(() => expect(toggle().textContent).toBe('Tema: Escuro'));
    await open();
    expect(checked()).toEqual(['Escuro']);
  });

  it('Claro grava o cookie mesmo com o sistema escuro', async () => {
    prefersDark = true;
    document.documentElement.className = 'dark';
    renderSwitcher('dark');

    await open();
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Claro' }));

    expect(cookieWrites).toEqual(['orakel-theme=light; Path=/; Max-Age=31536000; SameSite=Lax']);
    expect(document.documentElement.className).toBe('light');
  });

  it.each([
    [true, 'dark'],
    [false, 'light'],
  ] as const)(
    'Sistema apaga o cookie e aplica a preferência (escuro: %s)',
    async (dark, expected) => {
      prefersDark = dark;
      document.documentElement.className = dark ? 'light' : 'dark';
      renderSwitcher(dark ? 'light' : 'dark');

      await open();
      await userEvent.click(screen.getByRole('menuitemradio', { name: 'Sistema' }));

      expect(cookieWrites).toEqual(['orakel-theme=; Path=/; Max-Age=0; SameSite=Lax']);
      expect(document.documentElement.className).toBe(expected);
      await waitFor(() => expect(toggle().textContent).toBe('Tema: Sistema'));
    },
  );

  it('abre pelo teclado e escolhe com Enter', async () => {
    const user = userEvent.setup();
    renderSwitcher('light');

    toggle().focus();
    await user.keyboard('{Enter}');
    await screen.findAllByRole('menuitemradio');
    await user.keyboard('{ArrowDown}');
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: 'Escuro' })),
    );
    await user.keyboard('{Enter}');

    expect(cookieWrites.at(-1)).toContain('orakel-theme=dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
