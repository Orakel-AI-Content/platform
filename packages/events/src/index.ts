// Subcaminho ".": só o que atravessa versões. Payload, manifesto, layout e script de
// cada versão ficam no subcaminho dela (ex.: "@orakel/events/v1") — ADR 0002.

/**
 * Versões do formato que o código atende. Durante a promoção de uma release, o canário
 * grava na versão nova e os demais sites na anterior: o agregador lê as duas, escolhendo
 * pelo `blob1` de cada ponto.
 */
export const SUPPORTED_FORMAT_VERSIONS = [1] as const;

export type FormatVersion = (typeof SUPPORTED_FORMAT_VERSIONS)[number];

export function isSupportedFormatVersion(value: unknown): value is FormatVersion {
  return (SUPPORTED_FORMAT_VERSIONS as readonly unknown[]).includes(value);
}

export type { Issue, Result } from './result.ts';
