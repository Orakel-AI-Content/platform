// Erro esperado é valor, nunca exceção (ADR 0008 da raiz), no mesmo formato do content-model.
import type { Issue, Result } from '@orakel/content-model';

export type { Issue, Result };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail<T = never>(issues: Issue[]): Result<T> {
  return { ok: false, issues };
}
