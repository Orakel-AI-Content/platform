import type { Task } from 'graphile-worker';

import type { InfraResourceStep, InfraRunKind, InfraStep } from '../../db/schema/index.ts';
import { loadBuildTarget } from '../../domain/builds/builds.ts';
import { InfraPlanSummarySchema, stepOrder } from '../../domain/infra/drivers.ts';
import {
  finishInfraRun,
  loadInfraRun,
  recordInfraStep,
  type InfraRunClosing,
} from '../../domain/infra/runs.ts';
import { INFRA_APPLY_TASK, scheduleInfraApply } from '../../domain/infra/schedule.ts';
import { infraPayloadOf, type InfraTaskDeps } from './infra-run.ts';

/**
 * Primeira etapa com recurso no plano, na ordem do tipo: onde o apply estava quando nenhum recurso
 * começou.
 */
function firstPlannedStep(
  planSummary: string | null,
  kind: InfraRunKind,
): InfraResourceStep | null {
  if (planSummary === null) return null;
  try {
    const { steps } = InfraPlanSummarySchema.parse(JSON.parse(planSummary));
    return stepOrder(kind).find((step) => steps[step].length > 0) ?? null;
  } catch {
    return null;
  }
}

/** Log do `ok` e motivo da falha quando o site recusa o efeito do `ok`, pelo tipo. */
const OUTCOME_OF = {
  criar: {
    done: (siteId: string, nameservers: readonly string[]) =>
      `infra de ${siteId} aplicada: ${nameservers.join(', ')}`,
    refused: 'A infraestrutura foi aplicada, mas o site não pôde avançar a infra aplicada',
  },
  remover: {
    done: (siteId: string) => `infra de ${siteId} removida`,
    refused: 'A infraestrutura foi removida, mas o site não pôde voltar a cadastrado',
  },
  reaplicar: {
    done: (siteId: string) => `infra de ${siteId} reaplicada`,
    refused: 'A infraestrutura foi reaplicada, mas o site não pôde ser marcado como em dia',
  },
} as const satisfies Record<
  InfraRunKind,
  { done: (siteId: string, nameservers: readonly string[]) => string; refused: string }
>;

/**
 * Apply da criação, da remoção ou da reaplicação da infraestrutura (build-runner, ADR 0027 da
 * raiz), só depois da confirmação (`aplicando`): grava a etapa corrente conforme os recursos são
 * criados ou destruídos e fecha `ok` (a criação, com os nameservers, leva o site a
 * `infra_aplicada`; a remoção o devolve a `cadastrado`; a reaplicação o marca em dia) ou `falhou`
 * com a etapa e o motivo. Numa execução do lote de reaplicação, a mesma transação que fecha `ok`
 * enfileira o apply do próximo site (`next`); a falha para o lote. Erro inesperado também fecha
 * `falhou`: o job não se repete.
 */
export function createInfraApplyTask(deps: InfraTaskDeps): Task {
  return async (payload, helpers) => {
    const { siteId, runId } = infraPayloadOf(payload, INFRA_APPLY_TASK);
    const log = helpers.logger;
    const run = await loadInfraRun(deps.db, runId);
    if (run?.siteId !== siteId || run.status !== 'aplicando') {
      log.warn(
        `apply da infra ${runId} de ${siteId} ignorado: execução em ${run?.status ?? '(nenhuma)'}`,
      );
      return;
    }
    let current: InfraStep | null = null;
    const close = async (closing: InfraRunClosing) => {
      const closed = await deps.db.transaction(async (tx) => {
        const finished = await finishInfraRun(tx, runId, closing);
        if (finished.ok && finished.value.next !== null) {
          await scheduleInfraApply(tx, finished.value.next);
        }
        return finished;
      });
      if (closed.ok) {
        const { next } = closed.value;
        if (next !== null) log.info(`lote: apply da infra de ${next.siteId} enfileirado`);
        return true;
      }
      log.error(`execução ${runId} não fechada: ${JSON.stringify(closed.issues)}`);
      return false;
    };
    const fail = async (step: InfraStep | null, message: string) => {
      log.error(`apply da infra de ${siteId} falhou na etapa ${step ?? '(nenhuma)'}: ${message}`);
      await close({
        status: 'falhou',
        step: step ?? current ?? firstPlannedStep(run.planSummary, run.kind),
        message,
      });
    };

    try {
      const target = await loadBuildTarget(deps.db, siteId);
      if (target === undefined) return await fail(null, `Site ${siteId} não encontrado`);
      log.info(
        `apply da infra de ${siteId} (execução ${runId} de ${run.kind}, driver ${deps.infra.kind})`,
      );
      const outcome = await deps.infra.apply(
        { runId, siteId, domain: target.domain, kind: run.kind },
        async (step) => {
          current = step;
          const recorded = await deps.db.transaction((tx) => recordInfraStep(tx, runId, step));
          if (!recorded.ok) log.warn(`etapa ${step} da execução ${runId} não gravada`);
        },
      );
      if (outcome.status === 'failed') return await fail(outcome.step, outcome.failure.message);

      const outcomeOf = OUTCOME_OF[run.kind];
      if (
        await close(
          run.kind === 'criar'
            ? { status: 'ok', nameservers: outcome.nameservers }
            : { status: 'ok' },
        )
      ) {
        log.info(outcomeOf.done(siteId, outcome.nameservers));
        return;
      }
      // A mudança do site foi recusada (o lifecycle mudou): a execução não pode ficar aberta.
      await fail(current, outcomeOf.refused);
    } catch (error) {
      await fail(
        null,
        `Erro inesperado no apply: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
}
