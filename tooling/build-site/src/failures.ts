// Classificação das falhas (ADR 0002 da unidade). Os erros do blog e do content-client
// trazem `kind`; o Astro às vezes os embrulha, então a busca segue a cadeia de `cause`.
// Erro sem classificação é transitório: tentar de novo é mais seguro que pausar o site.
// O `culprit` (o conteúdo que causou a falha, posto pelo content-client) segue a mesma busca.
import { CulpritSchema, type Culprit, type Failure } from '@orakel/build-contract';

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

function culpritOf(error: unknown): Culprit | undefined {
  const parsed = CulpritSchema.safeParse((error as { culprit?: unknown } | null)?.culprit);
  return parsed.success ? parsed.data : undefined;
}

export function classify(error: unknown): Failure {
  const seen = new Set<unknown>();
  let classified: Pick<Failure, 'kind' | 'message'> | undefined;
  let culprit: Culprit | undefined;
  let current: unknown = error;
  while (current !== undefined && current !== null && !seen.has(current)) {
    seen.add(current);
    const kind = kindOf(current);
    classified ??= kind && { kind, message: (current as Error).message || 'Erro sem mensagem' };
    culprit ??= culpritOf(current);
    current = (current as { cause?: unknown }).cause;
  }
  if (!classified) {
    const message = error instanceof Error ? error.message : String(error);
    classified = { kind: 'transient', message: message || 'Erro sem mensagem' };
  }
  return culprit ? { ...classified, culprit } : classified;
}
