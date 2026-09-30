/// <reference types="astro/client" />
import type { PageContext } from './data/site-source.ts';

declare global {
  namespace App {
    interface Locals {
      /** Só na visualização: preenchido pelo middleware a partir de `/<site>/<caminho>`. */
      page?: PageContext;
    }
  }

  interface ImportMetaEnv {
    /** Saída do build (astro.config.ts): `static` ou `preview`. */
    readonly BLOG_OUTPUT: 'static' | 'preview';
  }
}
