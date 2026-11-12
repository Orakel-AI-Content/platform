import type { Task } from 'graphile-worker';

import type { Executor } from '../../db/client.ts';
import {
  loadReleaseRun,
  recordReleaseRunFailed,
  recordReleaseRunStarted,
  recordReleaseRunSucceeded,
  scheduleReleaseRunCheck,
} from '../../domain/releases/releases.ts';
import { GitHubError, type GitHubClient } from '../../lib/github.ts';
import { isLastAttempt } from './last-attempt.ts';

/** Workflow que publica a imagem site-builder:X.Y.Z (ADR 0018 da raiz); só sai da main. */
export const RELEASE_WORKFLOW = 'release.yml';
export const RELEASE_REF = 'main';
/** Intervalo entre as consultas ao run: o CI leva minutos, e cada consulta é uma requisição. */
export const RELEASE_POLL_MS = 30_000;

export const MISSING_TOKEN_REASON =
  'A credencial do GitHub não está configurada: defina GITHUB_RELEASE_TOKEN no build-runner';

export type ReleaseRunTaskDeps = {
  db: Executor;
  /** `undefined` sem GITHUB_RELEASE_TOKEN: a release falha com motivo, e o build-runner sobe igual. */
  github: GitHubClient | undefined;
  now?: () => number;
};

function tagOf(payload: unknown): string {
  const tag = (payload as { tag?: unknown } | null)?.tag;
  if (typeof tag !== 'string' || tag === '') {
    throw new Error(`Payload do run da release sem tag: ${JSON.stringify(payload)}`);
  }
  return tag;
}

/** Motivo legível de um run que terminou sem sucesso (o link do run fica em `runUrl`). */
export function runFailureReason(conclusion: string | null): string {
  switch (conclusion) {
    case 'failure':
      return 'O CI do release.yml falhou; veja o run';
    case 'cancelled':
      return 'O run do release.yml foi cancelado';
    case 'timed_out':
      return 'O run do release.yml passou do tempo limite';
    default:
      return `O run do release.yml terminou como ${conclusion ?? 'sem conclusão'}`;
  }
}

/**
 * Dispara o release.yml da release em `gerando` e acompanha o run (build-runner, o único com o
 * PAT, ADR 0022 da raiz). Cada execução faz uma chamada só: dispara (e grava o run) ou consulta;
 * se o run não terminou, o job se reagenda para daqui a `RELEASE_POLL_MS`, sem dormir no worker.
 * Sucesso leva a `baixando` com o download na fila; falha, cancelamento ou recusa do GitHub, a
 * `falhou` com o motivo. Rede e 5xx lançam para o Graphile Worker repetir; na última tentativa,
 * a release falha em vez de ficar `gerando` para sempre.
 */
export function createReleaseRunTask(deps: ReleaseRunTaskDeps): Task {
  const now = deps.now ?? Date.now;
  return async (payload, helpers) => {
    const tag = tagOf(payload);
    const log = helpers.logger;
    const found = await loadReleaseRun(deps.db, tag);
    if (found === undefined) {
      log.warn(`run da release ${tag} ignorado: release não registrada`);
      return;
    }
    if (found.pipelineState !== 'gerando') {
      log.info(`run da release ${tag} ignorado: release em ${found.pipelineState}`);
      return;
    }
    const fail = async (reason: string) => {
      await recordReleaseRunFailed(deps.db, tag, reason);
      log.warn(`release ${tag} falhou: ${reason}`);
    };
    if (deps.github === undefined) {
      await fail(MISSING_TOKEN_REASON);
      return;
    }

    try {
      const nextCheckAt = new Date(now() + RELEASE_POLL_MS);
      if (found.runId === null) {
        const run = await deps.github.dispatchWorkflow(RELEASE_WORKFLOW, RELEASE_REF, {
          version: tag,
        });
        await recordReleaseRunStarted(deps.db, tag, run, nextCheckAt);
        log.info(`release ${tag}: run ${run.runId} disparado (${run.runUrl})`);
        return;
      }

      const run = await deps.github.getRun(found.runId);
      if (run.status !== 'completed') {
        await scheduleReleaseRunCheck(deps.db, tag, nextCheckAt);
        return;
      }
      if (run.conclusion === 'success') {
        await recordReleaseRunSucceeded(deps.db, tag);
        log.info(`release ${tag}: CI concluído, imagem na fila de download`);
        return;
      }
      await fail(runFailureReason(run.conclusion));
    } catch (error) {
      if (!(error instanceof GitHubError)) throw error;
      if (!error.transient) {
        await fail(error.message);
        return;
      }
      if (isLastAttempt(helpers)) {
        await fail(`O GitHub não respondeu depois de várias tentativas: ${error.message}`);
        return;
      }
      throw error;
    }
  };
}
