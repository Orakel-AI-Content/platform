import type { Task } from 'graphile-worker';

import type { Db } from '../../db/client.ts';
import { reprocessSiteMedia } from '../../domain/media/reprocess.ts';
import type { ObjectStore } from '../../domain/media/store.ts';

export type MediaReprocessTaskDeps = { db: Db; store: ObjectStore };

function siteIdOf(payload: unknown): string {
  const siteId = (payload as { siteId?: unknown } | null)?.siteId;
  if (typeof siteId !== 'string' || siteId === '') {
    throw new Error(`Payload do reprocessamento sem siteId: ${JSON.stringify(payload)}`);
  }
  return siteId;
}

/**
 * Reprocessamento das variantes de um site (12.0, L4). Mídia sem original vai para o log e
 * não interrompe as demais; falha de armazenamento ou banco lança e o job é repetido.
 */
export function createMediaReprocessTask(deps: MediaReprocessTaskDeps): Task {
  return async (payload, helpers) => {
    const siteId = siteIdOf(payload);
    const report = await reprocessSiteMedia(
      { ...deps, warn: (message) => helpers.logger.warn(message) },
      siteId,
    );
    helpers.logger.info(
      `reprocessamento de ${siteId}: ${report.updated.length} mídias atualizadas, ` +
        `${report.written} arquivos gravados, ${report.withoutOriginal.length} sem original`,
    );
  };
}
