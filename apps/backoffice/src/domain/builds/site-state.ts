// Colunas operacionais do site (estado, motivo da pausa, ciclo de vida), gravadas pelo build
// e pelas etapas manuais do ciclo de vida. Não vão para o snapshot: gravar aqui não gera
// mudança pendente — senão cada build agendaria outro. Único módulo fora de pending-changes
// liberado no teste de varredura.
import type { Result } from '@orakel/content-model';
import { and, eq, ne } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { sites } from '../../db/schema/index.ts';
import { requireRole, type Actor } from '../access/rbac.ts';

/** Falha permanente: o site para de receber builds até ser retomado (L4). */
export async function pauseSite(tx: Executor, siteId: string, reason: string): Promise<void> {
  await tx
    .update(sites)
    .set({ state: 'pausado', pausedReason: reason })
    .where(eq(sites.id, siteId));
}

/** Primeira publicação bem-sucedida: o site passa a `publicado`. */
export async function markPublished(tx: Executor, siteId: string): Promise<void> {
  await tx
    .update(sites)
    .set({ lifecycle: 'publicado' })
    .where(and(eq(sites.id, siteId), ne(sites.lifecycle, 'publicado')));
}

/** Etapas marcadas à mão pela operação, cada uma com a etapa de que parte. */
const MANUAL_STEPS = {
  infra_aplicada: 'cadastrado',
  zona_ativa: 'infra_aplicada',
} as const;

export type ManualLifecycleStep = keyof typeof MANUAL_STEPS;

/**
 * Marca uma etapa manual do ciclo de vida, só a partir da anterior (sem voltar nem pular).
 * O update condicional decide a ordem: duas marcações simultâneas não passam as duas.
 */
export async function advanceLifecycle(
  tx: Executor,
  actor: Actor,
  siteId: string,
  step: ManualLifecycleStep,
): Promise<Result<void>> {
  const allowed = requireRole(actor, 'site.configure');
  if (!allowed.ok) return allowed;

  const from = MANUAL_STEPS[step];
  const updated = await tx
    .update(sites)
    .set({ lifecycle: step })
    .where(and(eq(sites.id, siteId), eq(sites.lifecycle, from)))
    .returning({ id: sites.id });
  if (updated.length > 0) return { ok: true, value: undefined };

  const [site] = await tx
    .select({ lifecycle: sites.lifecycle })
    .from(sites)
    .where(eq(sites.id, siteId));
  if (site === undefined) {
    return {
      ok: false,
      issues: [{ code: 'site.not_found', message: `Site ${siteId} não encontrado`, path: [] }],
    };
  }
  return {
    ok: false,
    issues: [
      {
        code: 'site.lifecycle_order',
        message: `${step} só pode ser marcada a partir de ${from}; o site está em ${site.lifecycle}`,
        path: ['lifecycle'],
      },
    ],
  };
}
