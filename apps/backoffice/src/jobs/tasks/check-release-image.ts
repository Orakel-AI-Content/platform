import type { Task } from 'graphile-worker';

import {
  loadReleaseRun,
  recordReleaseImagePulled,
  recordReleaseImagePullFailed,
} from '../../domain/releases/releases.ts';
import type { BuildTaskDeps } from './build.ts';
import { isLastAttempt } from './last-attempt.ts';

function tagOf(payload: unknown): string {
  const tag = (payload as { tag?: unknown } | null)?.tag;
  if (typeof tag !== 'string' || tag === '') {
    throw new Error(`Payload da conferência de imagem sem tag: ${JSON.stringify(payload)}`);
  }
  return tag;
}

/**
 * Baixa a imagem site-builder da release em `baixando` e confere que ela chegou ao host
 * (build-runner, o único com acesso ao Docker pelo docker-socket-proxy, ADR 0011 da raiz).
 * Imagem no host leva a `disponivel`. Erro do pull, ou pull que termina sem a imagem, lança para
 * o Graphile Worker repetir; na última tentativa, a release vai a `falhou` com o motivo do
 * runtime em vez de ficar `baixando` para sempre. Release em outro estado é ignorada.
 */
export function createCheckReleaseImageTask(
  deps: Pick<BuildTaskDeps, 'db' | 'runtime' | 'settings' | 'now'>,
): Task {
  const now = deps.now ?? Date.now;
  return async (payload, helpers) => {
    const tag = tagOf(payload);
    const log = helpers.logger;
    const image = `${deps.settings.image}:${tag}`;
    const found = await loadReleaseRun(deps.db, tag);
    if (found === undefined) {
      log.warn(`download de ${image} ignorado: release ${tag} não registrada`);
      return;
    }
    if (found.pipelineState !== 'baixando') {
      log.info(`download de ${image} ignorado: release em ${found.pipelineState}`);
      return;
    }

    try {
      await deps.runtime.pullImage(image);
      if (!(await deps.runtime.imageExists(image))) {
        throw new Error(`o download terminou, mas ${image} não está no host`);
      }
    } catch (error) {
      if (!isLastAttempt(helpers)) throw error;
      const message = error instanceof Error ? error.message : String(error);
      const reason = `Não foi possível baixar a imagem: ${message}`;
      await recordReleaseImagePullFailed(deps.db, tag, reason, new Date(now()));
      log.warn(`release ${tag} falhou: ${reason}`);
      return;
    }
    await recordReleaseImagePulled(deps.db, tag, new Date(now()));
    log.info(`release ${tag}: imagem ${image} no host, release disponível`);
  };
}
