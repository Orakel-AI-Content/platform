// Subcaminho ".": o que não depende da versão de schema. Leitura e loaders ficam em
// "./v1" e "./v1/astro"; a release do site usa o cliente da versão que conhece.

export { failureKind, type FailureKind } from './failures.ts';

/** Versões da API de exportação que este código sabe ler. */
export const CLIENT_SCHEMA_VERSIONS = [1] as const;

/** URL do snapshot de um site na API de exportação (só na rede interna). */
export function snapshotUrl(baseUrl: string, site: string, version: number): string {
  return `${baseUrl.replace(/\/$/, '')}/api/export/v${version}/sites/${encodeURIComponent(site)}/snapshot`;
}
