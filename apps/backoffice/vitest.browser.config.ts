import { fileURLToPath } from 'node:url';

import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

import {
  emulateMedia,
  emulateTimezone,
  pressAndChooseFiles,
  resetPointer,
} from './test/browser/commands.ts';

// Testes de componente em Chromium real (Vitest Browser Mode, #457): teclado, foco, axe, tema
// e movimento sem servidor nem banco, com o CSS de `globals.css`. Fora do `pnpm test`: a
// tarefa é `test:browser`. O fuso do navegador é o de São Paulo, como no E2E do DateTimepicker.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('src', import.meta.url)) } },
  test: {
    include: ['src/**/*.browser.test.tsx'],
    setupFiles: ['./test/browser/setup.ts'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
      // Janela de desktop, como a do E2E: o padrão do Browser Mode é de celular.
      viewport: { width: 1280, height: 720 },
      commands: { emulateMedia, emulateTimezone, pressAndChooseFiles, resetPointer },
    },
  },
});
