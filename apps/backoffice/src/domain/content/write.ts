import type { Issue, Result } from '@orakel/content-model';
import type * as z from 'zod';

import { requireRole, type Action, type Actor } from '../access/rbac.ts';

/** Permissão comum às gravações de conteúdo: devolve o erro de `requireRole`, se houver. */
export function checkWrite(actor: Actor, action: Action = 'content.write'): Result<void> {
  return requireRole(actor, action);
}

/** Opções da gravação: `id` explícito só na importação (seed, migração de acervo). */
export type WriteOptions = { id?: number };

/** Valida a entrada pelo schema do content-model; os erros viram issues `schema.*`. */
export function parseInput<T>(schema: z.ZodType<T>, input: unknown): Result<T> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.map((issue) => ({
      code: `schema.${issue.code}`,
      message: issue.message,
      path: issue.path,
    })),
  };
}

/** Recusa com um issue só (slug repetido, entidade inexistente). */
export function refuse(code: string, message: string, path: PropertyKey[] = []): Result<never> {
  const issue: Issue = { code, message, path };
  return { ok: false, issues: [issue] };
}
