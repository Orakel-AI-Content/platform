import '@/app/globals.css';

import { afterEach } from 'vitest';
import { commands } from 'vitest/browser';

import { setReducedMotion, setTheme } from './a11y.ts';

// O `next/link` (Pagination com `getPageHref`, DataTable, menu) lê `process.env` ao carregar
// (caminho base, barra no fim), que o navegador não tem: um `env` vazio, como o de um app sem
// essas opções (#459).
(globalThis as { process?: unknown }).process ??= { env: { NODE_ENV: 'test' } };

// O documento da página de teste, como o do layout raiz: idioma e título (o axe cobra os
// dois) e o tema claro. Cada teste volta ao claro, ao movimento sem preferência e ao ponteiro
// fora da página.
document.documentElement.lang = 'pt-BR';
document.title = 'Teste de componentes';
document.documentElement.classList.add('light');

afterEach(async () => {
  await setTheme('light');
  await setReducedMotion('no-preference');
  await commands.resetPointer();
});
