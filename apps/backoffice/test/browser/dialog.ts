import { expect, vi } from 'vitest';
import { userEvent, type Locator } from 'vitest/browser';

import { APP_ELEMENT_ID } from '@/components/ui/utils/modalApp';

// Helpers dos testes de Dialog, Drawer e ConfirmDialog (#458; da vitrine, #209), montados com
// `renderInApp`: o contêiner da app, o foco preso e o aviso do react-modal sem `appElement`.

/** O contêiner da app que o `renderInApp` monta, como o do layout raiz. */
export const appRoot = (): HTMLElement => document.getElementById(APP_ELEMENT_ID)!;

/** Tab e Shift+Tab repetidos (6 de cada) não tiram o foco de dentro do diálogo. */
export async function expectFocusTrapped(dialog: Locator): Promise<void> {
  for (const key of ['{Tab}', '{Shift>}{Tab}{/Shift}']) {
    for (let step = 0; step < 6; step += 1) {
      await userEvent.keyboard(key);
      expect(dialog.element().contains(document.activeElement)).toBe(true);
    }
  }
}

/** Mensagens do react-modal sem o `appElement` registrado (o `warning` vai ao console.error). */
export function appElementWarnings(): () => string[] {
  const error = vi.spyOn(console, 'error');
  const warn = vi.spyOn(console, 'warn');
  return () =>
    [...error.mock.calls, ...warn.mock.calls]
      .map((args) => args.map(String).join(' '))
      .filter((message) => /App element is not defined/i.test(message));
}
