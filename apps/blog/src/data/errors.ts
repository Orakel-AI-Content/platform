// Erro de build com a classificação da falha (ADR 0003 do content-client): o render do
// site-builder traduz `permanent` para o código de saída 10 e `transient` para 20.
import type { FailureKind } from '@orakel/content-client';

export type { FailureKind };

export class BuildError extends Error {
  readonly kind: FailureKind;

  constructor(message: string, kind: FailureKind) {
    super(message);
    this.name = 'BuildError';
    this.kind = kind;
  }
}

/** Problemas do core (colisões de rota, limites de redirect) são sempre permanentes. */
export function permanent(message: string, issues: readonly { code: string; message: string }[]) {
  const details = issues.map((issue) => `${issue.code}: ${issue.message}`).join('; ');
  return new BuildError(`${message} — ${details}`, 'permanent');
}
