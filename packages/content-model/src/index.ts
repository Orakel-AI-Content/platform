// Subcaminho ".": só o que atravessa versões. Schemas, recursos e validação de cada
// versão ficam no subcaminho dela (ex.: "@orakel/content-model/v1") — ADR 0002.

/**
 * Versões de schema que o código atende hoje. A API de exportação atende a da release
 * corrente e a da anterior (N-1); retirar uma versão é apagar a pasta, o subcaminho e
 * o número daqui.
 */
export const SUPPORTED_SCHEMA_VERSIONS = [1] as const;

export type SchemaVersion = (typeof SUPPORTED_SCHEMA_VERSIONS)[number];

export function isSupportedSchemaVersion(value: unknown): value is SchemaVersion {
  return (SUPPORTED_SCHEMA_VERSIONS as readonly unknown[]).includes(value);
}

export type { Issue, Result } from './result.ts';
