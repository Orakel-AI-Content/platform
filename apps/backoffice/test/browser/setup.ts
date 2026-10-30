import '@/app/globals.css';

import { afterEach } from 'vitest';
import { commands, page } from 'vitest/browser';

import { setReducedMotion, setTheme } from './a11y.ts';

// O `next/link` (Pagination com `getPageHref`, DataTable, menu) lê `process.env` ao carregar
// (caminho base, barra no fim), que o navegador não tem: um `env` vazio, como o de um app sem
// essas opções (#459).
(globalThis as { process?: unknown }).process ??= { env: { NODE_ENV: 'test' } };

// O documento da página de teste, como o do layout raiz: idioma e título (o axe cobra os
// dois) e o tema claro. Cada teste volta ao claro, ao movimento sem preferência, ao ponteiro
// fora da página e à janela de desktop do config (quem muda a largura usa `page.viewport`).
// O fuso de São Paulo vem do comando `emulateTimezone` (ver `commands.ts`).
await commands.emulateTimezone();

document.documentElement.lang = 'pt-BR';
document.title = 'Teste de componentes';
document.documentElement.classList.add('light');

afterEach(async () => {
  await setTheme('light');
  await setReducedMotion('no-preference');
  await commands.resetPointer();
  await page.viewport(1280, 720);
});
