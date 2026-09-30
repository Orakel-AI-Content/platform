import type { Issue } from '@orakel/content-model';

/**
 * Transitória: vale tentar de novo (rede, HTTP 5xx, snapshot cortado). Permanente: tentar
 * de novo não muda nada (token, site inexistente, conteúdo inválido). O render do
 * site-builder traduz para os códigos de saída 20 e 10.
 */
export type FailureKind = 'transient' | 'permanent';

const TRANSIENT = /^(network|http\.5\d\d|http\.429|truncated|semantic\.snapshot-structure)$/;

export function failureKind(issues: readonly Issue[]): FailureKind {
  return issues.length > 0 && issues.every((issue) => TRANSIENT.test(issue.code))
    ? 'transient'
    : 'permanent';
}
