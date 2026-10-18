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
 * Aplica a escolha do cabeçalho no navegador: grava (ou apaga) o cookie para o servidor e troca
 * a classe do <html> na hora. Só em handler de evento, nunca no render.
 */
export function applyThemeChoice(choice: ThemeChoice, doc: Document = document): void {
  doc.cookie = themeCookie(choice);
  const prefersDark = doc.defaultView?.matchMedia('(prefers-color-scheme: dark)').matches ?? false;
  applyThemeClass(doc.documentElement.classList, resolveTheme(choice, prefersDark));
}

/** Modo do cookie de tema numa string de `document.cookie`, ou `undefined` (sistema). */
export function cookieThemeMode(cookie: string): ThemeMode | undefined {
  const entry = cookie.split(/;\s*/).find((part) => part.startsWith(`${THEME_COOKIE}=`));
  return parseThemeMode(entry?.slice(THEME_COOKIE.length + 1));
}

/**
 * Reaplica no <html> o tema que vale (cookie ou sistema). Para a `global-error` montada no
 * cliente, quando o React troca o <html> e apaga a classe; só em efeito, nunca no render.
 */
export function applyStoredTheme(doc: Document = document): void {
  const mode = cookieThemeMode(doc.cookie);
  const prefersDark = doc.defaultView?.matchMedia('(prefers-color-scheme: dark)').matches ?? false;
  applyThemeClass(doc.documentElement.classList, resolveTheme(mode ?? 'system', prefersDark));
}

/**
 * Script inline e bloqueante do <head>, só no modo sistema: põe `dark` ou `light` no <html>
 * pela preferência do sistema antes da primeira pintura. Se uma CSP entrar no Backoffice, ele
 * vai precisar de nonce ou hash.
 */
export const THEME_SCRIPT = `document.documentElement.classList.add(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')`;

/**
 * Script inline e bloqueante da `global-error`, que substitui o layout raiz e, como Client
 * Component, não lê o cookie no servidor: aplica o modo do cookie (não é `HttpOnly`) quando
 * válido e, sem ele ou com valor desconhecido, cai no THEME_SCRIPT. Só vale no HTML do servidor:
 * montada no cliente, a `global-error` usa o `applyStoredTheme`.
 */
export const THEME_COOKIE_SCRIPT = `(function(){var m=document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE}=([^;]*)/),v=m&&m[1];if(${JSON.stringify(THEME_MODES)}.indexOf(v)>=0)document.documentElement.classList.add(v);else ${THEME_SCRIPT}})()`;
