import { defineBrowserCommand } from '@vitest/browser-playwright';
import type { FileChooser } from 'playwright';

// Comandos do Browser Mode que rodam no Node, com a `Page` do Playwright: o que a página de
// teste não alcança sozinha. Os tipos do lado do navegador estão em `a11y.ts`.

export type MediaOptions = {
  colorScheme?: 'light' | 'dark';
  reducedMotion?: 'reduce' | 'no-preference';
};

export type ChosenFile = { name: string; mimeType: string; base64: string };

/** `prefers-color-scheme` e `prefers-reduced-motion` de verdade, sem mock de `matchMedia`. */
export const emulateMedia = defineBrowserCommand<[MediaOptions]>(async (context, options) => {
  await context.page.emulateMedia(options);
});

/**
 * Leva o ponteiro ao canto de baixo da página de teste, longe dos componentes: sem isso, o
 * hover de um teste vale para o seguinte. Fica dentro do iframe, para o Chromium atualizar o
 * elemento sob o ponteiro (fora dele, o próximo hover não dispara `mouseenter` no gatilho).
 */
export const resetPointer = defineBrowserCommand<[]>(async (context) => {
  const frame = await (await context.frame()).frameElement();
  const box = await frame.boundingBox();
  if (box) await context.page.mouse.move(box.x + box.width - 2, box.y + box.height - 2);
});

/**
 * Aperta a tecla com o foco onde está e responde ao seletor de arquivos nativo que ela abre.
 * Devolve se o seletor aceita vários arquivos. Falha se a tecla não abrir o seletor.
 *
 * O Playwright liga a interceptação do seletor sem esperar o navegador confirmar: com a máquina
 * ocupada, a primeira tecla pode chegar antes e o seletor (sem interceptação, cancelado no
 * headless) não vira evento. Por isso, até três tentativas.
 */
export const pressAndChooseFiles = defineBrowserCommand<[string, ChosenFile[]]>(
  async (context, key, files) => {
    let chooser: FileChooser | null = null;
    for (let attempt = 0; attempt < 3 && !chooser; attempt += 1) {
      [chooser] = await Promise.all([
        context.page.waitForEvent('filechooser', { timeout: 2000 }).catch(() => null),
        context.page.keyboard.press(key),
      ]);
    }
    if (!chooser) throw new Error(`A tecla ${key} não abriu o seletor de arquivos`);
    await chooser.setFiles(
      files.map(({ name, mimeType, base64 }) => ({
        name,
        mimeType,
        buffer: Buffer.from(base64, 'base64'),
      })),
    );
    return chooser.isMultiple();
  },
);
