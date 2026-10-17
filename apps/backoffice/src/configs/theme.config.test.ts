// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

import { applyThemeClass, parseThemeMode, resolveTheme, themeCookie } from './theme.config';

describe('parseThemeMode', () => {
  it('aceita light e dark', () => {
    expect(parseThemeMode('light')).toBe('light');
    expect(parseThemeMode('dark')).toBe('dark');
  });

  it('trata ausente ou desconhecido como sistema', () => {
    expect(parseThemeMode(undefined)).toBeUndefined();
    expect(parseThemeMode('')).toBeUndefined();
    expect(parseThemeMode('Dark')).toBeUndefined();
    expect(parseThemeMode('system')).toBeUndefined();
  });
});

describe('themeCookie', () => {
  it('grava o modo fixo por um ano, no site inteiro', () => {
    expect(themeCookie('dark')).toBe('orakel-theme=dark; Path=/; Max-Age=31536000; SameSite=Lax');
    expect(themeCookie('light')).toBe('orakel-theme=light; Path=/; Max-Age=31536000; SameSite=Lax');
  });

  it('no sistema, apaga o cookie', () => {
    expect(themeCookie('system')).toBe('orakel-theme=; Path=/; Max-Age=0; SameSite=Lax');
  });
});

describe('resolveTheme', () => {
  it('o modo fixo vale, qualquer que seja a preferência do sistema', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('no sistema, vale a preferência', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('applyThemeClass', () => {
  it('troca a classe de tema e preserva as outras', () => {
    const root = document.createElement('html');
    root.className = 'font-var light';

    applyThemeClass(root.classList, 'dark');
    expect(root.className).toBe('font-var dark');

    applyThemeClass(root.classList, 'light');
    expect(root.className).toBe('font-var light');
  });
});
