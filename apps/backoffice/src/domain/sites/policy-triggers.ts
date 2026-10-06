import type { Result } from '@orakel/content-model';
import { and, eq } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { sitePolicyTriggers, sites, type POLICY_TRIGGERS } from '../../db/schema/index.ts';
import { requireRole, type Actor } from '../access/rbac.ts';

// Gatilhos de política cumpridos por site (RN-SIT-07). Tabela operacional, fora do snapshot:
// registrar não gera mudança pendente. Desfazer um registro está fora do escopo atual.

export type PolicyTrigger = (typeof POLICY_TRIGGERS)[number];

/** Registra que o site cumpriu um gatilho (quem e quando vêm do ator e do banco). */
export async function registerPolicyTrigger(
  tx: Executor,
  actor: Actor,
  siteId: string,
  trigger: PolicyTrigger,
  note: string | null = null,
): Promise<Result<void>> {
  const allowed = requireRole(actor, 'site.configure');
  if (!allowed.ok) return allowed;

  const [site] = await tx.select({ id: sites.id }).from(sites).where(eq(sites.id, siteId));
  if (site === undefined) {
    return {
      ok: false,
      issues: [{ code: 'site.not_found', message: `Site ${siteId} não encontrado`, path: [] }],
    };
  }
  const inserted = await tx
    .insert(sitePolicyTriggers)
    .values({ siteId, trigger, registeredBy: actor.email, note })
    .onConflictDoNothing()
    .returning({ trigger: sitePolicyTriggers.trigger });
  if (inserted.length === 0) {
    return {
      ok: false,
      issues: [
        {
          code: 'site.trigger_exists',
          message: `O ${trigger} do site ${siteId} já está registrado`,
          path: ['trigger'],
        },
      ],
    };
  }
  return { ok: true, value: undefined };
}

export async function hasPolicyTrigger(
  db: Executor,
  siteId: string,
  trigger: PolicyTrigger,
): Promise<boolean> {
  const rows = await db
    .select({ trigger: sitePolicyTriggers.trigger })
    .from(sitePolicyTriggers)
    .where(and(eq(sitePolicyTriggers.siteId, siteId), eq(sitePolicyTriggers.trigger, trigger)));
  return rows.length > 0;
}
