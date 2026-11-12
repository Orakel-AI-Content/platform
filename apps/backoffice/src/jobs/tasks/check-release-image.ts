import type { Task } from 'graphile-worker';

import { ImageUnavailableError } from '../../domain/builds/runtime.ts';
import {
  loadReleaseRun,
  recordReleaseImagePulled,
  recordReleaseImagePullFailed,
} from '../../domain/releases/releases.ts';
import type { BuildTaskDeps } from './build.ts';
import { isLastAttempt } from './last-attempt.ts';
import type { ReleaseRunTaskDeps } from './release-run.ts';

/** Driver local sem a imagem de origem no host: repetir não a traz (ADR 0023 da raiz). */
export function missingLocalImageReason(source: string): string {
  return `A imagem ${source} não está no host: rode pnpm local:images e tente de novo`;
}

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
 * runtime em vez de ficar `baixando` para sempre. Imagem recusada pelo registry (não existe ou
 * acesso negado) vai a `falhou` já na primeira tentativa. Release em outro estado é ignorada.
 * Com o driver local, em vez do pull, etiqueta `SITE_BUILDER_IMAGE:SITE_BUILDER_TAG` (a imagem
 * do `pnpm local:images`) como a versão; sem ela no host, `falhou` já na primeira tentativa.
 */
export function createCheckReleaseImageTask(
  deps: Pick<BuildTaskDeps, 'db' | 'runtime' | 'settings' | 'now'> &
    Pick<ReleaseRunTaskDeps, 'driver'>,
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

    const fail = async (reason: string) => {
      await recordReleaseImagePullFailed(deps.db, tag, reason, new Date(now()));
      log.warn(`release ${tag} falhou: ${reason}`);
    };

    try {
      if (deps.driver.kind === 'local') {
        // O env exige SITE_BUILDER_TAG com o driver local; a guarda só estreita o tipo.
        if (deps.settings.defaultTag === undefined) {
          await fail('RELEASE_DRIVER=local sem SITE_BUILDER_TAG');
          return;
        }
        const source = `${deps.settings.image}:${deps.settings.defaultTag}`;
        if (!(await deps.runtime.imageExists(source))) {
          await fail(missingLocalImageReason(source));
          return;
        }
        await deps.runtime.tagImage(source, image);
      } else {
        await deps.runtime.pullImage(image);
      }
      if (!(await deps.runtime.imageExists(image))) {
        throw new Error(`o download terminou, mas ${image} não está no host`);
      }
    } catch (error) {
      // O registry recusou a imagem: repetir não a traz, então falha já nesta tentativa.
      if (!isLastAttempt(helpers) && !(error instanceof ImageUnavailableError)) throw error;
      const message = error instanceof Error ? error.message : String(error);
      await fail(`Não foi possível baixar a imagem: ${message}`);
      return;
    }
    await recordReleaseImagePulled(deps.db, tag, new Date(now()));
    log.info(`release ${tag}: imagem ${image} no host, release disponível`);
  };
}
