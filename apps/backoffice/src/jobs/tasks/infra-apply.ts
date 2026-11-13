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
import { INFRA_APPLY_TASK } from '../../domain/infra/schedule.ts';
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

/**
 * Apply da criação ou da remoção da infraestrutura (build-runner, ADR 0027 da raiz), só depois da
 * confirmação (`aplicando`): grava a etapa corrente conforme os recursos são criados ou destruídos
 * e fecha `ok` (a criação, com os nameservers, leva o site a `infra_aplicada`; a remoção o devolve
 * a `cadastrado`) ou `falhou` com a etapa e o motivo. Erro inesperado também fecha `falhou`: o job
 * não se repete.
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
      const closed = await deps.db.transaction((tx) => finishInfraRun(tx, runId, closing));
      if (closed.ok) return true;
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

      const removal = run.kind === 'remover';
      if (
        await close(removal ? { status: 'ok' } : { status: 'ok', nameservers: outcome.nameservers })
      ) {
        log.info(
          removal
            ? `infra de ${siteId} removida`
            : `infra de ${siteId} aplicada: ${outcome.nameservers.join(', ')}`,
        );
        return;
      }
      // A mudança do site foi recusada (o lifecycle mudou): a execução não pode ficar aberta.
      await fail(
        current,
        removal
          ? 'A infraestrutura foi removida, mas o site não pôde voltar a cadastrado'
          : 'A infraestrutura foi aplicada, mas o site não pôde avançar a infra aplicada',
      );
    } catch (error) {
      await fail(
        null,
        `Erro inesperado no apply: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
}
