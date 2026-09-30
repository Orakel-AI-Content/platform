// Classificação das falhas (ADR 0002 da unidade). Os erros do blog e do content-client
// trazem `kind`; o Astro às vezes os embrulha, então a busca segue a cadeia de `cause`.
// Erro sem classificação é transitório: tentar de novo é mais seguro que pausar o site.
import type { Failure } from './contract.ts';

export class ClassifiedError extends Error {
  readonly kind: Failure['kind'];

  constructor(message: string, kind: Failure['kind']) {
    super(message);
    this.name = 'ClassifiedError';
    this.kind = kind;
  }
}

function kindOf(error: unknown): Failure['kind'] | undefined {
  const kind = (error as { kind?: unknown } | null)?.kind;
  return kind === 'permanent' || kind === 'transient' ? kind : undefined;
}

export function classify(error: unknown): Failure {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current !== undefined && current !== null && !seen.has(current)) {
    seen.add(current);
    const kind = kindOf(current);
    if (kind) {
      return { kind, message: (current as Error).message || 'Erro sem mensagem' };
    }
    current = (current as { cause?: unknown }).cause;
  }
  const message = error instanceof Error ? error.message : String(error);
  return { kind: 'transient', message: message || 'Erro sem mensagem' };
}
