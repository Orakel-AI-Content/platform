import axe from 'axe-core';
import { commands, userEvent, type Locator } from 'vitest/browser';

import type { ChosenFile, MediaOptions } from './commands.ts';

// Helpers de acessibilidade dos testes de componente (#457), com a mesma régua do E2E
// (`test/e2e/components.spec.ts` e `focus.spec.ts`): axe nas tags WCAG 2.2 AA, contorno de
// foco de 2px, alvo de 24 px, tema pela classe do <html> e movimento pela mídia emulada.

declare module 'vitest/browser' {
  interface BrowserCommands {
    emulateMedia: (options: MediaOptions) => Promise<void>;
    pressAndChooseFiles: (key: string, files: ChosenFile[]) => Promise<boolean>;
    resetPointer: () => Promise<void>;
  }
}

export const COLOR_SCHEMES = ['light', 'dark'] as const;
export type ColorScheme = (typeof COLOR_SCHEMES)[number];

export const REDUCED_MOTIONS = ['reduce', 'no-preference'] as const;

const WCAG = ['wcag2a', 'wcag2aa', 'wcag22aa'];

type Target = Element | Locator;

const toElement = (target: Target): Element =>
  target instanceof Element ? target : target.element();

/**
 * Violações do axe nas tags WCAG 2.2 AA, como `rule: seletores`, para a falha dizer onde. Os
 * "focus guards" do floating-ui ficam de fora, como no E2E (decisão no escalonamento da #210).
 * Sem alvo, audita o documento inteiro (portais incluídos).
 */
export async function audit(...targets: Target[]): Promise<string[]> {
  const include = targets.length === 0 ? [document] : targets.map(toElement);
  const result = await axe.run(
    { include, exclude: [['[data-floating-ui-focus-guard]']] },
    { runOnly: { type: 'tag', values: WCAG } },
  );
  return result.violations.map(
    (violation) =>
      `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
  );
}

/**
 * Emula a mídia e espera a página de teste ver a mudança: o `change` da media query chega
 * depois do comando, e quem a ouve (o `useReducedMotion` do motion) leria o valor antigo.
 */
async function emulate(query: string, options: MediaOptions): Promise<void> {
  const media = matchMedia(query);
  const changed = media.matches
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
        media.addEventListener('change', () => resolve(), { once: true });
      });
  await commands.emulateMedia(options);
  await changed;
}

/** Tema do Backoffice: a classe no <html> (como o layout raiz) e a mídia do navegador. */
export async function setTheme(scheme: ColorScheme): Promise<void> {
  document.documentElement.classList.toggle('dark', scheme === 'dark');
  document.documentElement.classList.toggle('light', scheme === 'light');
  await emulate(`(prefers-color-scheme: ${scheme})`, { colorScheme: scheme });
}

/** `prefers-reduced-motion` no navegador, para o `MotionConfig` e as transições do CSS. */
export async function setReducedMotion(
  reducedMotion: (typeof REDUCED_MOTIONS)[number],
): Promise<void> {
  await emulate(`(prefers-reduced-motion: ${reducedMotion})`, { reducedMotion });
}

/** A cor de uma variável CSS como o navegador a calcula, para comparar com o outline-color. */
export function cssColor(variable: string): string {
  const probe = document.createElement('span');
  probe.style.color = `var(${variable})`;
  document.body.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}

/** Contorno do elemento: cor, estilo e largura. */
export function outline(target: Target) {
  const style = getComputedStyle(toElement(target));
  return { color: style.outlineColor, style: style.outlineStyle, width: style.outlineWidth };
}

/** O contorno de foco esperado: 2px sólido na cor da variável (o --ring, por padrão). */
export const focusRing = (variable = '--ring') => ({
  color: cssColor(variable),
  style: 'solid',
  width: '2px',
});

/** Alvo de toque e de clique (WCAG 2.5.8): largura e altura do elemento na tela. */
export function targetSize(target: Target) {
  const { width, height } = toElement(target).getBoundingClientRect();
  return { width, height };
}

/** Leva o foco até o controle só com Tab (no máximo 80 passos). */
export async function tabTo(target: Target): Promise<void> {
  for (let step = 0; step < 80; step += 1) {
    if (toElement(target) === document.activeElement) return;
    await userEvent.keyboard('{Tab}');
  }
  throw new Error('O controle não recebeu o foco pelo teclado');
}
