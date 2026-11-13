import type { Task } from 'graphile-worker';

import {
  INFRA_RESOURCE_STEPS,
  type InfraResourceStep,
  type InfraStep,
} from '../../db/schema/index.ts';
import { loadBuildTarget } from '../../domain/builds/builds.ts';
import { InfraPlanSummarySchema } from '../../domain/infra/drivers.ts';
import {
  finishInfraRun,
  loadInfraRun,
  recordInfraStep,
  type InfraRunClosing,
} from '../../domain/infra/runs.ts';
import { INFRA_APPLY_TASK } from '../../domain/infra/schedule.ts';
import { infraPayloadOf, type InfraTaskDeps } from './infra-run.ts';

/** Primeira etapa com recurso no plano: onde o apply estava quando nenhum recurso começou. */
function firstPlannedStep(planSummary: string | null): InfraResourceStep | null {
  if (planSummary === null) return null;
  try {
    const { steps } = InfraPlanSummarySchema.parse(JSON.parse(planSummary));
    return INFRA_RESOURCE_STEPS.find((step) => steps[step].length > 0) ?? null;
  } catch {
    return null;
  }
}

/**
 * Apply da criação da infraestrutura (build-runner, ADR 0027 da raiz), só depois da confirmação
 * (`aplicando`): grava a etapa corrente conforme os recursos avançam e fecha `ok` com os
 * nameservers (o site vai a `infra_aplicada`) ou `falhou` com a etapa e o motivo. Erro
 * inesperado também fecha `falhou`: o job não se repete.
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
        step: step ?? current ?? firstPlannedStep(run.planSummary),
        message,
      });
    };

    try {
      const target = await loadBuildTarget(deps.db, siteId);
      if (target === undefined) return await fail(null, `Site ${siteId} não encontrado`);
      log.info(`apply da infra de ${siteId} (execução ${runId}, driver ${deps.infra.kind})`);
      const outcome = await deps.infra.apply(
        { runId, siteId, domain: target.domain },
        async (step) => {
          current = step;
          const recorded = await deps.db.transaction((tx) => recordInfraStep(tx, runId, step));
          if (!recorded.ok) log.warn(`etapa ${step} da execução ${runId} não gravada`);
        },
      );
      if (outcome.status === 'failed') return await fail(outcome.step, outcome.failure.message);

      if (await close({ status: 'ok', nameservers: outcome.nameservers })) {
        log.info(`infra de ${siteId} aplicada: ${outcome.nameservers.join(', ')}`);
        return;
      }
      // O avanço do site foi recusado (o lifecycle mudou): a execução não pode ficar aberta.
      await fail(
        current,
        'A infraestrutura foi aplicada, mas o site não pôde avançar a infra aplicada',
      );
    } catch (error) {
      await fail(
        null,
        `Erro inesperado no apply: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
}
