import type { Task } from 'graphile-worker';

import { recordReleaseImageCheck } from '../../domain/releases/releases.ts';
import type { BuildTaskDeps } from './build.ts';

function tagOf(payload: unknown): string {
  const tag = (payload as { tag?: unknown } | null)?.tag;
  if (typeof tag !== 'string' || tag === '') {
    throw new Error(`Payload da conferência de imagem sem tag: ${JSON.stringify(payload)}`);
  }
  return tag;
}

/**
 * Confere se a imagem site-builder da release está no host (build-runner, o único com acesso
 * ao Docker pelo docker-socket-proxy, ADR 0011 da raiz) e grava o resultado em `releases`.
 * Só informa: não baixa a imagem nem bloqueia builds. Erro do proxy lança para o Graphile
 * Worker repetir.
 */
export function createCheckReleaseImageTask(
  deps: Pick<BuildTaskDeps, 'db' | 'runtime' | 'settings' | 'now'>,
): Task {
  const now = deps.now ?? Date.now;
  return async (payload, helpers) => {
    const tag = tagOf(payload);
    const image = `${deps.settings.image}:${tag}`;
    const available = await deps.runtime.imageExists(image);
    const recorded = await recordReleaseImageCheck(deps.db, tag, available, new Date(now()));
    if (!recorded) {
      helpers.logger.warn(`conferência de ${image} ignorada: release ${tag} não registrada`);
      return;
    }
    helpers.logger.info(`imagem ${image} ${available ? 'disponível' : 'ausente'} no host`);
  };
}
