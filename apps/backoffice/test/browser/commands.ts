import { defineBrowserCommand } from '@vitest/browser-playwright';

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
 * Aperta a tecla com o foco onde está e responde ao seletor de arquivos nativo que ela abre.
 * Devolve se o seletor aceita vários arquivos. Falha se a tecla não abrir o seletor.
 */
export const pressAndChooseFiles = defineBrowserCommand<[string, ChosenFile[]]>(
  async (context, key, files) => {
    const [chooser] = await Promise.all([
      context.page.waitForEvent('filechooser', { timeout: 5000 }),
      context.page.keyboard.press(key),
    ]);
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
