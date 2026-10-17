// Tema do Backoffice (#203): claro ou escuro por classe no <html>, como no Ecme. A escolha da
// pessoa fica num cookie, que o layout raiz lê para a classe já vir no HTML do servidor; sem
// cookie (ou com valor desconhecido), vale o sistema, aplicado pelo script de THEME_SCRIPT
// antes da primeira pintura. O controle que grava o cookie é do cabeçalho (workspace#46).

export const THEME_COOKIE = 'orakel-theme';

export const THEME_MODES = ['light', 'dark'] as const;

export type ThemeMode = (typeof THEME_MODES)[number];

/** Modo gravado no cookie, ou `undefined` (sistema) para ausente ou desconhecido. */
export function parseThemeMode(value: string | undefined): ThemeMode | undefined {
  return THEME_MODES.find((mode) => mode === value);
}

/**
 * Script inline e bloqueante do <head>, só no modo sistema: põe `dark` ou `light` no <html>
 * pela preferência do sistema antes da primeira pintura. Se uma CSP entrar no Backoffice, ele
 * vai precisar de nonce ou hash.
 */
export const THEME_SCRIPT = `document.documentElement.classList.add(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')`;
