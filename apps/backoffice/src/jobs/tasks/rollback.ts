import type { Task } from 'graphile-worker';

import { loadBuildTarget } from '../../domain/builds/builds.ts';
import { planRollback } from '../../domain/builds/plan.ts';
import { runRollback } from '../../domain/builds/run-rollback.ts';
import { setActiveVersion } from '../../domain/builds/site-state.ts';
import { TransientBuildError, type BuildTaskDeps } from './build.ts';

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
 * pausa. A transitória lança para o Graphile Worker repetir; a permanente só é registrada.
 */
export function createRollbackTask(deps: BuildTaskDeps): Task {
  const now = deps.now ?? Date.now;
  return async (payload, helpers) => {
    const { siteId, versionId } = payloadOf(payload);
    const log = helpers.logger;
    const target = await loadBuildTarget(deps.db, siteId);
    if (target === undefined) {
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
    log.info(
      `rollback de ${siteId} para ${versionId} na release ${plan.release} (tentativa ${attempt})`,
    );

    const outcome = await runRollback(plan, {
      runtime: deps.runtime,
      now,
      log: (msg) => log.warn(msg),
    });
    if (outcome.status === 'ok') {
      await deps.db.transaction((tx) => setActiveVersion(tx, siteId, outcome.rollback.versionId));
      log.info(`rollback de ${siteId}: versão ${versionId} ativa (${outcome.durationMs} ms)`);
      return;
    }
    const message = `rollback de ${siteId} para ${versionId} falhou (${outcome.failure.kind}): ${outcome.failure.message}`;
    if (outcome.failure.kind === 'transient') throw new TransientBuildError(message);
    log.error(message);
  };
}
