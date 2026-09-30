import type { Result } from '@orakel/content-model';

import { requireRole, type Action, type Actor } from '../access/rbac.ts';

/** Permissão comum às gravações de conteúdo: devolve o erro de `requireRole`, se houver. */
export function checkWrite(actor: Actor, action: Action = 'content.write'): Result<void> {
  return requireRole(actor, action);
}

/** Opções da gravação: `id` explícito só na importação (seed, migração de acervo). */
export type WriteOptions = { id?: number };
