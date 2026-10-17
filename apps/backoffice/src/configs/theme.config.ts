// Tema do Backoffice (#203): claro ou escuro por classe no <html>, como no Ecme. A escolha da
// pessoa fica num cookie, que o layout raiz lê para a classe já vir no HTML do servidor; sem
// cookie (ou com valor desconhecido), vale o sistema, aplicado pelo script de THEME_SCRIPT
// antes da primeira pintura. O controle que grava o cookie é o ThemeSwitcher do cabeçalho (#240).

export const THEME_COOKIE = 'orakel-theme';

export const THEME_MODES = ['light', 'dark'] as const;

export type ThemeMode = (typeof THEME_MODES)[number];

/** Modo gravado no cookie, ou `undefined` (sistema) para ausente ou desconhecido. */
export function parseThemeMode(value: string | undefined): ThemeMode | undefined {
  return THEME_MODES.find((mode) => mode === value);
}

/** Escolha no cabeçalho: um modo fixo (gravado no cookie) ou o sistema (sem cookie). */
export type ThemeChoice = ThemeMode | 'system';

/** A escolha vale por um ano; a cada troca, o prazo recomeça. */
const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Valor de `document.cookie` que grava o modo fixo ou, no sistema, apaga o cookie. */
export function themeCookie(choice: ThemeChoice): string {
  const value = choice === 'system' ? '' : choice;
  const maxAge = choice === 'system' ? 0 : THEME_COOKIE_MAX_AGE;
  return `${THEME_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

/** Tema que vale: o escolhido ou, no sistema, o da preferência (como no THEME_SCRIPT). */
export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): ThemeMode {
  if (choice !== 'system') return choice;
  return prefersDark ? 'dark' : 'light';
}

/** Troca a classe de tema do <html>, deixando só a do modo dado. */
export function applyThemeClass(classList: DOMTokenList, mode: ThemeMode): void {
  classList.remove(...THEME_MODES);
  classList.add(mode);
}

/**
 * Script inline e bloqueante do <head>, só no modo sistema: põe `dark` ou `light` no <html>
 * pela preferência do sistema antes da primeira pintura. Se uma CSP entrar no Backoffice, ele
 * vai precisar de nonce ou hash.
 */
export const THEME_SCRIPT = `document.documentElement.classList.add(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')`;
