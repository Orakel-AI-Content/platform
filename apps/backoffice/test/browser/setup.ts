import '@/app/globals.css';

import { afterEach } from 'vitest';
import { commands } from 'vitest/browser';

// O documento da página de teste, como o do layout raiz: idioma e título (o axe cobra os
// dois) e o tema claro. Cada teste volta ao claro e ao movimento sem preferência.
document.documentElement.lang = 'pt-BR';
document.title = 'Teste de componentes';
document.documentElement.classList.add('light');

afterEach(async () => {
  document.documentElement.classList.remove('dark');
  document.documentElement.classList.add('light');
  await commands.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
});
