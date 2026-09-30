// Build estático do blog no mesmo processo (API do Astro): os erros chegam com o `kind`
// que o blog e o content-client põem, e a classificação não depende de ler log.
import { build } from 'astro';

import { BLOG_DIR } from '../paths.ts';
import type { BuildSite } from './render.ts';

export const astroBuild: BuildSite = async ({ outDir, env }) => {
  delete process.env.BLOG_OUTPUT; // sempre a saída estática
  Object.assign(process.env, env);
  // Parte dos caches do Astro/Vite (.astro/.prerender) é relativa ao diretório atual.
  process.chdir(BLOG_DIR);
  await build({ root: BLOG_DIR, outDir, logLevel: 'warn' });
};
