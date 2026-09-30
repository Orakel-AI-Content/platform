// As páginas não sabem de onde vêm os dados (ADR 0003 da unidade): recebem o snapshot
// validado do site. No build estático, das coleções do Content Layer; no SSR da
// visualização, do snapshot lido por site. Rascunhos ao vivo entram trocando a fonte do SSR.
import type { Snapshot } from '@orakel/content-model/v1';

export type SiteData = Snapshot;

/** Contexto de uma requisição: o site, o caminho dentro dele e o prefixo dos links. */
export type PageContext = {
  site: SiteData;
  /** Caminho do site, sempre com barra final (`/`, `/guia-completo/`). */
  path: string;
  /** '' no estático; '/<site>' na visualização. */
  base: string;
  preview: boolean;
};
