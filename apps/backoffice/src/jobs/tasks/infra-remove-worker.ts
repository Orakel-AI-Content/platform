import type { Task } from 'graphile-worker';

import { finishInfraRun, loadInfraRun, recordInfraStep } from '../../domain/infra/runs.ts';
import { INFRA_REMOVE_WORKER_TASK, scheduleEmptySiteMedia } from '../../domain/infra/schedule.ts';
import type { WorkerRemover } from '../../lib/cloudflare.ts';
import { infraPayloadOf, type InfraTaskDeps } from './infra-run.ts';

export type InfraRemoveWorkerTaskDeps = Pick<InfraTaskDeps, 'db'> & { workers: WorkerRemover };

/**
 * Elo 1 da remoção (build-runner, ADR 0028 da raiz): com a remoção confirmada (`aplicando`), grava
 * a etapa `paginas` e apaga o Worker do site pelo token de deploy. Worker ausente também é sucesso
 * (o elo é idempotente). No sucesso, grava a etapa `imagens` e enfileira o esvaziamento no
 * backoffice-worker, na mesma transação; na falha, ou em erro inesperado, fecha `falhou` em
 * `paginas` e a cadeia para (o job não se repete).
 */
export function createInfraRemoveWorkerTask(deps: InfraRemoveWorkerTaskDeps): Task {
  return async (payload, helpers) => {
    const { siteId, runId } = infraPayloadOf(payload, INFRA_REMOVE_WORKER_TASK);
    const log = helpers.logger;
    const run = await loadInfraRun(deps.db, runId);
    if (run?.siteId !== siteId || run.kind !== 'remover' || run.status !== 'aplicando') {
      log.warn(
        `remoção do Worker ${runId} de ${siteId} ignorada: execução em ${run?.status ?? '(nenhuma)'}`,
      );
      return;
    }
    const fail = async (message: string) => {
      log.error(`remoção do Worker de ${siteId} falhou: ${message}`);
      const closed = await deps.db.transaction((tx) =>
        finishInfraRun(tx, runId, { status: 'falhou', step: 'paginas', message }),
      );
      if (!closed.ok) log.error(`execução ${runId} não fechada: ${JSON.stringify(closed.issues)}`);
    };

    try {
      const started = await deps.db.transaction((tx) => recordInfraStep(tx, runId, 'paginas'));
      if (!started.ok) {
        log.warn(`remoção do Worker ${runId} de ${siteId} ignorada: a execução já não aplica`);
        return;
      }
      const removal = await deps.workers.remove(siteId);
      if (removal.kind === 'falha') return await fail(removal.message);
      log.info(
        removal.kind === 'removido'
          ? `Worker de ${siteId} removido`
          : `Worker de ${siteId} já não existia`,
      );

      const next = await deps.db.transaction(async (tx) => {
        const recorded = await recordInfraStep(tx, runId, 'imagens');
        if (recorded.ok) await scheduleEmptySiteMedia(tx, { siteId, runId });
        return recorded;
      });
      if (!next.ok) log.warn(`execução ${runId} já não aplica: esvaziamento não enfileirado`);
    } catch (error) {
      await fail(
        `Erro inesperado ao remover o Worker: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
}
