import type { Task } from 'graphile-worker';

import type { Db } from '../../db/client.ts';
import {
  buildCancelRequested,
  cancelQueuedBuild,
  loadBuildTarget,
  queueRetry,
  recordBuild,
  setCurrentStage,
  startBuild,
} from '../../domain/builds/builds.ts';
import { planBuild, type BuildSettings } from '../../domain/builds/plan.ts';
import { runBuild } from '../../domain/builds/run-build.ts';
import type { ContainerRuntime } from '../../domain/builds/runtime.ts';
import { retryRunAt } from '../../domain/builds/schedule.ts';
import { isLastAttempt } from './last-attempt.ts';

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
 * Build de um site (build-runner, 12.0 L3). Site pausado não é construído até ser retomado, e
 * a linha `na_fila` do job fecha como `cancelado`. Cada tentativa é uma linha em `builds`: a
 * `na_fila` do agendamento é promovida a `rodando` e fechada com o resultado. A transitória
 * deixa a próxima tentativa `na_fila` e lança para o Graphile Worker repetir; a permanente
 * pausa o site (recordBuild) e encerra o job. O "Cancelar" de uma tentativa `rodando` é visto
 * pelo `runBuild` durante a espera do container: a linha fecha `cancelado` e o job termina.
 */
export function createBuildTask(deps: BuildTaskDeps): Task {
  const now = deps.now ?? Date.now;
  return async (payload, helpers) => {
    const siteId = siteIdOf(payload);
    const log = helpers.logger;
    const target = await loadBuildTarget(deps.db, siteId);
    if (target === undefined) {
      await cancelQueuedBuild(deps.db, helpers.job.id);
      log.warn(`build de ${siteId} ignorado: site não existe`);
      return;
    }
    if (target.state === 'pausado') {
      await cancelQueuedBuild(deps.db, helpers.job.id);
      log.info(
        `build de ${siteId} ignorado: site pausado (${target.pausedReason ?? 'sem motivo'})`,
      );
      return;
    }

    const attempt = helpers.job.attempts;
    const plan = planBuild(target, deps.settings, `${siteId}-${helpers.job.id}-${attempt}`);
    const startedAt = new Date(now());
    const buildId = await startBuild(deps.db, {
      siteId,
      release: plan.release,
      jobId: helpers.job.id,
      attempt,
      startedAt,
    });
    log.info(
      `build de ${siteId} na release ${plan.release ?? '(sem versão)'} (tentativa ${attempt})`,
    );

    const outcome = await runBuild(plan, {
      runtime: deps.runtime,
      now,
      log: (msg) => log.warn(msg),
      onStage: (stage) => setCurrentStage(deps.db, buildId, stage),
      cancelRequested: () => buildCancelRequested(deps.db, buildId),
    });
    const retried = outcome.status === 'failed' && outcome.failure.kind === 'transient';
    const lastAttempt = isLastAttempt(helpers);
    await deps.db.transaction(async (tx) => {
      await recordBuild(
        tx,
        { buildId, siteId, massUnpublishDeclaredAt: target.massUnpublishDeclaredAt, lastAttempt },
        outcome,
      );
      if (retried && !lastAttempt) {
        await queueRetry(tx, buildId, retryRunAt(helpers.job.run_at, attempt, new Date(now())));
      }
    });

    if (outcome.status === 'ok') {
      log.info(
        `build de ${siteId} publicado: versão ${outcome.publish.versionId}, ` +
          `${outcome.render.pages} páginas, render ${outcome.renderMs} ms, publish ${outcome.publishMs} ms`,
      );
      return;
    }
    if (outcome.status === 'cancelled') {
      // Não é falha: o job termina sem lançar, e o Graphile Worker não repete.
      log.info(`build de ${siteId} cancelado a pedido no ${outcome.stage}`);
      return;
    }
    const message = `build de ${siteId} falhou no ${outcome.stage} (${outcome.failure.kind}): ${outcome.failure.message}`;
    if (outcome.failure.kind === 'transient') throw new TransientBuildError(message);
    log.error(`${message} — site pausado`);
  };
}
