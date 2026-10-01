import type { Task } from 'graphile-worker';

import type { Db } from '../../db/client.ts';
import { loadBuildTarget, recordBuild } from '../../domain/builds/builds.ts';
import { planBuild, type BuildSettings } from '../../domain/builds/plan.ts';
import { runBuild } from '../../domain/builds/run-build.ts';
import type { ContainerRuntime } from '../../domain/builds/runtime.ts';

export type BuildTaskDeps = {
  db: Db;
  runtime: ContainerRuntime;
  settings: BuildSettings;
  now?: () => number;
};

/** Falha transitória: o Graphile Worker repete o job (até 5 tentativas, com backoff). */
export class TransientBuildError extends Error {
  override readonly name = 'TransientBuildError';
}

function siteIdOf(payload: unknown): string {
  const siteId = (payload as { siteId?: unknown } | null)?.siteId;
  if (typeof siteId !== 'string' || siteId === '') {
    throw new Error(`Payload do build sem siteId: ${JSON.stringify(payload)}`);
  }
  return siteId;
}

/**
 * Build de um site (build-runner, 12.0 L3). Site pausado não é construído até ser retomado.
 * Cada tentativa é registrada; a transitória lança para o Graphile Worker repetir, a
 * permanente pausa o site (recordBuild) e encerra o job.
 */
export function createBuildTask(deps: BuildTaskDeps): Task {
  const now = deps.now ?? Date.now;
  return async (payload, helpers) => {
    const siteId = siteIdOf(payload);
    const log = helpers.logger;
    const target = await loadBuildTarget(deps.db, siteId);
    if (target === undefined) {
      log.warn(`build de ${siteId} ignorado: site não existe`);
      return;
    }
    if (target.state === 'pausado') {
      log.info(
        `build de ${siteId} ignorado: site pausado (${target.pausedReason ?? 'sem motivo'})`,
      );
      return;
    }

    const attempt = helpers.job.attempts;
    const plan = planBuild(target, deps.settings, `${siteId}-${helpers.job.id}-${attempt}`);
    const startedAt = new Date(now());
    log.info(`build de ${siteId} na release ${plan.release} (tentativa ${attempt})`);

    const outcome = await runBuild(plan, {
      runtime: deps.runtime,
      now,
      log: (msg) => log.warn(msg),
    });
    await deps.db.transaction((tx) =>
      recordBuild(
        tx,
        { siteId, release: plan.release, jobId: helpers.job.id, attempt, startedAt },
        outcome,
      ),
    );

    if (outcome.status === 'ok') {
      log.info(
        `build de ${siteId} publicado: versão ${outcome.publish.versionId}, ` +
          `${outcome.render.pages} páginas, render ${outcome.renderMs} ms, publish ${outcome.publishMs} ms`,
      );
      return;
    }
    const message = `build de ${siteId} falhou no ${outcome.stage} (${outcome.failure.kind}): ${outcome.failure.message}`;
    if (outcome.failure.kind === 'transient') throw new TransientBuildError(message);
    log.error(`${message} — site pausado`);
  };
}
