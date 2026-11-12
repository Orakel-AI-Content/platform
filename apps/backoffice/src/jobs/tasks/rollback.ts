import type { Task } from 'graphile-worker';

import {
  cancelQueuedBuild,
  loadBuildTarget,
  queueRetry,
  recordRollback,
  startBuild,
} from '../../domain/builds/builds.ts';
import { planRollback } from '../../domain/builds/plan.ts';
import { runRollback } from '../../domain/builds/run-rollback.ts';
import { retryRunAt } from '../../domain/builds/schedule.ts';
import { TransientBuildError, type BuildTaskDeps } from './build.ts';
import { isLastAttempt } from './last-attempt.ts';

function payloadOf(payload: unknown): { siteId: string; versionId: string } {
  const { siteId, versionId } = (payload ?? {}) as { siteId?: unknown; versionId?: unknown };
  if (
    typeof siteId !== 'string' ||
    siteId === '' ||
    typeof versionId !== 'string' ||
    versionId === ''
  ) {
    throw new Error(`Payload do rollback sem siteId ou versionId: ${JSON.stringify(payload)}`);
  }
  return { siteId, versionId };
}

/**
 * Rollback de um site (build-runner, ADR 0009 do build-site): ativa no alvo uma versão já
 * publicada e, com sucesso, ela passa a ser a versão ativa do site. Não muda o estado nem a
 * pausa. Cada tentativa é uma linha em `builds` (tipo rollback), no ciclo da task `build`: a
 * `na_fila` do pedido é promovida a `rodando` e fechada com o resultado. A transitória deixa
 * a próxima tentativa `na_fila` e lança para o Graphile Worker repetir; a permanente só é
 * registrada.
 */
export function createRollbackTask(deps: BuildTaskDeps): Task {
  const now = deps.now ?? Date.now;
  return async (payload, helpers) => {
    const { siteId, versionId } = payloadOf(payload);
    const log = helpers.logger;
    const target = await loadBuildTarget(deps.db, siteId);
    if (target === undefined) {
      await cancelQueuedBuild(deps.db, helpers.job.id);
      log.warn(`rollback de ${siteId} ignorado: site não existe`);
      return;
    }

    const attempt = helpers.job.attempts;
    const plan = planRollback(
      target,
      deps.settings,
      versionId,
      `${siteId}-rollback-${helpers.job.id}-${attempt}`,
    );
    const buildId = await startBuild(deps.db, {
      siteId,
      release: plan.release,
      jobId: helpers.job.id,
      attempt,
      startedAt: new Date(now()),
      run: { kind: 'rollback', versionId },
    });
    log.info(
      `rollback de ${siteId} para ${versionId} na release ${plan.release ?? '(sem versão)'} (tentativa ${attempt})`,
    );

    const outcome = await runRollback(plan, {
      runtime: deps.runtime,
      now,
      log: (msg) => log.warn(msg),
    });
    const retried = outcome.status === 'failed' && outcome.failure.kind === 'transient';
    await deps.db.transaction(async (tx) => {
      await recordRollback(tx, { buildId, siteId }, outcome);
      if (retried && !isLastAttempt(helpers)) {
        await queueRetry(tx, buildId, retryRunAt(helpers.job.run_at, attempt, new Date(now())));
      }
    });

    if (outcome.status === 'ok') {
      log.info(`rollback de ${siteId}: versão ${versionId} ativa (${outcome.durationMs} ms)`);
      return;
    }
    const message = `rollback de ${siteId} para ${versionId} falhou (${outcome.failure.kind}): ${outcome.failure.message}`;
    if (outcome.failure.kind === 'transient') throw new TransientBuildError(message);
    log.error(message);
  };
}
