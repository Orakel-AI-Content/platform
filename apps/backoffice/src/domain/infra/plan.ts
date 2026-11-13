// "Criar infraestrutura" pelo Backoffice (#825): o pedido do plano e a confirmação, cada um na
// mesma transação que enfileira a task do build-runner (a confirmação da remoção, o primeiro elo
// da cadeia dela, workspace#97), e a leitura do plano para o diálogo,
// com o resumo já validado. Cancelar não tem transição: a execução fica aberta e o diálogo é
// reaberto por "Revisar e confirmar"; se o estado mudar até a confirmação, o apply falha e pede
// um plano novo.
import type { Result } from '@orakel/content-model';
import { eq } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { infraRuns } from '../../db/schema/index.ts';
import { requireRole, type Actor } from '../access/rbac.ts';
import { InfraPlanSummarySchema, type InfraPlanSummary } from './drivers.ts';
import {
  confirmInfraRemoval,
  confirmInfraRun,
  requestInfraRemoval,
  requestInfraRun,
} from './runs.ts';
import { scheduleInfraApply, scheduleInfraPlan, scheduleInfraRemoveWorker } from './schedule.ts';

/** Mensagem do plano que falhou sem motivo gravado. */
export const INFRA_PLAN_FAILED_MESSAGE = 'Não foi possível preparar o resumo.';

const runNotFound = (runId: number, siteId: string) => ({
  ok: false as const,
  issues: [
    {
      code: 'infra.run_not_found',
      message: `Execução de infraestrutura ${runId} não encontrada no site ${siteId}`,
      path: [],
    },
  ],
});

/** Pede a criação da infraestrutura e enfileira o plano (`requestInfraRun` + `scheduleInfraPlan`). */
export async function requestInfraPlan(
  tx: Executor,
  actor: Actor,
  siteId: string,
): Promise<Result<{ runId: number }>> {
  const requested = await requestInfraRun(tx, actor, siteId);
  if (!requested.ok) return requested;
  const runId = requested.value.id;
  await scheduleInfraPlan(tx, { siteId, runId });
  return { ok: true, value: { runId } };
}

/**
 * Pede a remoção da infraestrutura e enfileira o plano de destruição (`requestInfraRemoval` +
 * `scheduleInfraPlan`, workspace#97): o mesmo `infra-plan`, que roda no modo destroy pelo tipo da
 * execução. Recusado o pedido, nada é enfileirado.
 */
export async function requestInfraRemovalPlan(
  tx: Executor,
  actor: Actor,
  siteId: string,
): Promise<Result<{ runId: number }>> {
  const requested = await requestInfraRemoval(tx, actor, siteId);
  if (!requested.ok) return requested;
  const runId = requested.value.id;
  await scheduleInfraPlan(tx, { siteId, runId });
  return { ok: true, value: { runId } };
}

/** Linha da execução, só se for do site. */
async function siteRun(db: Executor, siteId: string, runId: number) {
  const [run] = await db.select().from(infraRuns).where(eq(infraRuns.id, runId));
  return run?.siteId === siteId ? run : undefined;
}

/** Confirma o plano do site e enfileira o apply (`confirmInfraRun` + `scheduleInfraApply`). */
export async function confirmInfraPlan(
  tx: Executor,
  actor: Actor,
  siteId: string,
  runId: number,
): Promise<Result<void>> {
  const allowed = requireRole(actor, 'site.configure');
  if (!allowed.ok) return allowed;
  if ((await siteRun(tx, siteId, runId)) === undefined) return runNotFound(runId, siteId);
  const confirmed = await confirmInfraRun(tx, actor, runId);
  if (!confirmed.ok) return confirmed;
  await scheduleInfraApply(tx, { siteId, runId });
  return confirmed;
}

/**
 * Confirma a remoção do site com o domínio digitado e enfileira o primeiro elo da cadeia, o que
 * apaga o Worker (`confirmInfraRemoval` + `scheduleInfraRemoveWorker`). Recusada a confirmação,
 * nada é enfileirado.
 */
export async function confirmInfraRemovalPlan(
  tx: Executor,
  actor: Actor,
  siteId: string,
  runId: number,
  typedDomain: string,
): Promise<Result<void>> {
  const allowed = requireRole(actor, 'site.destroy');
  if (!allowed.ok) return allowed;
  if ((await siteRun(tx, siteId, runId)) === undefined) return runNotFound(runId, siteId);
  const confirmed = await confirmInfraRemoval(tx, actor, runId, typedDomain);
  if (!confirmed.ok) return confirmed;
  await scheduleInfraRemoveWorker(tx, { siteId, runId });
  return confirmed;
}

/** O plano de uma execução, como o diálogo de "Criar infraestrutura" o mostra. */
export type InfraPlanView =
  | { status: 'planejando' }
  /** `summary` nulo quando o resumo gravado não é um `InfraPlanSummary` válido. */
  | { status: 'aguardando_confirmacao'; summary: InfraPlanSummary | null }
  | { status: 'falhou'; message: string }
  /** Já confirmada, concluída ou cancelada pelo lote: não há mais o que confirmar. */
  | { status: 'aplicando' | 'ok' | 'cancelado' };

function parseSummary(raw: string | null): InfraPlanSummary | null {
  if (raw === null) return null;
  try {
    const parsed = InfraPlanSummarySchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Lê o plano da execução do site, com o resumo validado; só com site.configure. */
export async function readInfraPlan(
  db: Executor,
  actor: Actor,
  siteId: string,
  runId: number,
): Promise<Result<InfraPlanView>> {
  const allowed = requireRole(actor, 'site.configure');
  if (!allowed.ok) return allowed;
  const run = await siteRun(db, siteId, runId);
  if (run === undefined) return runNotFound(runId, siteId);
  switch (run.status) {
    case 'planejando':
      return { ok: true, value: { status: 'planejando' } };
    case 'aguardando_confirmacao':
      return {
        ok: true,
        value: { status: 'aguardando_confirmacao', summary: parseSummary(run.planSummary) },
      };
    case 'falhou':
      return {
        ok: true,
        value: { status: 'falhou', message: run.failureMessage ?? INFRA_PLAN_FAILED_MESSAGE },
      };
    default:
      return { ok: true, value: { status: run.status } };
  }
}
