// Subcaminho ".": o que não depende da versão de schema. Leitura e loaders ficam em
// "./v1" e "./v1/astro"; a release do site usa o cliente da versão que conhece.

export { failureKind, type FailureKind } from './failures.ts';

/** Versões da API de exportação que este código sabe ler. */
export const CLIENT_SCHEMA_VERSIONS = [1] as const;

/**
 * Qual snapshot ler: o do build (última versão publicada de cada conteúdo) ou o da
 * visualização (versão mais recente, rascunhos inclusive). Cada um tem o seu token.
 */
export type SnapshotKind = 'build' | 'preview';

const SNAPSHOT_ROUTES: Record<SnapshotKind, string> = {
  build: 'snapshot',
  preview: 'preview-snapshot',
};

/** URL do snapshot de um site na API de exportação (só na rede interna). */
export function snapshotUrl(
  baseUrl: string,
  site: string,
  version: number,
  kind: SnapshotKind = 'build',
): string {
  return `${baseUrl.replace(/\/$/, '')}/api/export/v${version}/sites/${encodeURIComponent(site)}/${SNAPSHOT_ROUTES[kind]}`;
}
