import type { Task } from 'graphile-worker';

import { loadBuildTarget } from '../../domain/builds/builds.ts';
import { finishInfraRun, loadInfraRun, recordInfraPlan } from '../../domain/infra/runs.ts';
import { INFRA_PLAN_TASK } from '../../domain/infra/schedule.ts';
import { infraPayloadOf, type InfraTaskDeps } from './infra-run.ts';

/**
 * Plano da criação ou da remoção da infraestrutura (build-runner, ADR 0027 da raiz), pelo tipo da
 * execução: o driver gera o plano e o resumo por etapa vai para a execução, que passa a `aguardando_confirmacao`. Nada é aplicado
 * aqui: o apply só é enfileirado pela confirmação. Falha, ou erro inesperado, fecha a execução
 * `falhou` sem etapa (o job não se repete; "Tentar de novo" é uma execução nova).
 */
export function createInfraPlanTask(deps: InfraTaskDeps): Task {
  return async (payload, helpers) => {
    const { siteId, runId } = infraPayloadOf(payload, INFRA_PLAN_TASK);
    const log = helpers.logger;
    const run = await loadInfraRun(deps.db, runId);
    if (run?.siteId !== siteId || run.status !== 'planejando') {
      log.warn(
        `plano da infra ${runId} de ${siteId} ignorado: execução em ${run?.status ?? '(nenhuma)'}`,
      );
      return;
    }
    const fail = async (message: string) => {
      const closed = await deps.db.transaction((tx) =>
        finishInfraRun(tx, runId, { status: 'falhou', step: null, message }),
      );
      log.error(`plano da infra de ${siteId} falhou: ${message}`);
      if (!closed.ok) log.error(`execução ${runId} não fechada: ${JSON.stringify(closed.issues)}`);
    };

    try {
      const target = await loadBuildTarget(deps.db, siteId);
      if (target === undefined) return await fail(`Site ${siteId} não encontrado`);
      log.info(
        `plano da infra de ${siteId} (execução ${runId} de ${run.kind}, driver ${deps.infra.kind})`,
      );
      const outcome = await deps.infra.plan({
        runId,
        siteId,
        domain: target.domain,
        kind: run.kind,
      });
      if (outcome.status === 'failed') return await fail(outcome.failure.message);

      const recorded = await deps.db.transaction((tx) =>
        recordInfraPlan(tx, runId, JSON.stringify(outcome.summary)),
      );
      if (!recorded.ok) return await fail(recorded.issues.map((i) => i.message).join('; '));
      log.info(`plano da infra de ${siteId} pronto: aguardando confirmação`);
    } catch (error) {
      await fail(
        `Erro inesperado no plano: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
}
