import type { Result } from '@orakel/content-model';

import type { Role } from '../../db/schema/index.ts';

// RBAC (proposta da entrada): checado no domínio e em cada route handler; o proxy do Next
// só redireciona. Uma ação nova entra aqui e no teste da matriz.

export type Action =
  | 'site.read'
  | 'site.configure'
  | 'content.write'
  | 'content.publish'
  | 'operations.run'
  | 'release.promote';

export const PERMISSIONS: Record<Role, readonly Action[]> = {
  admin: [
    'site.read',
    'site.configure',
    'content.write',
    'content.publish',
    'operations.run',
    'release.promote',
  ],
  editor: ['site.read', 'content.write'],
  revisor: ['site.read', 'content.publish'],
  operacao: ['site.read', 'site.configure', 'operations.run', 'release.promote'],
};

/** Quem age: uma pessoa (JWT do Access) ou o sistema (seed, jobs). */
export type Actor = { email: string; roles: readonly Role[] };

export const SYSTEM_ACTOR: Actor = { email: 'system', roles: ['admin'] };

export function can(actor: Actor, action: Action): boolean {
  return actor.roles.some((role) => PERMISSIONS[role].includes(action));
}

export function requireRole(actor: Actor, action: Action): Result<void> {
  return can(actor, action)
    ? { ok: true, value: undefined }
    : {
        ok: false,
        issues: [{ code: 'forbidden', message: `Sem permissão para ${action}`, path: [] }],
      };
}
