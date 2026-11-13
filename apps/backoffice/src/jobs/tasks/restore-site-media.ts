import type { Task } from 'graphile-worker';

import type { Db } from '../../db/client.ts';
import { restoreSiteMedia } from '../../domain/media/reprocess.ts';
import type { ObjectStore } from '../../domain/media/store.ts';

export type RestoreSiteMediaTaskDeps = { db: Db; store: ObjectStore };

function siteIdOf(payload: unknown): string {
  const siteId = (payload as { siteId?: unknown } | null)?.siteId;
  if (typeof siteId !== 'string' || siteId === '') {
    throw new Error(`Payload da regravação sem siteId: ${JSON.stringify(payload)}`);
  }
  return siteId;
}

/**
 * Regrava em `media-<site>` as variantes registradas, enfileirada pelo `ok` da criação da infra
 * (workspace#97): só o backoffice-worker tem as credenciais S3. Mídia sem original vai para o
 * log e não interrompe as demais; falha de armazenamento ou banco lança e o job é repetido.
 */
export function createRestoreSiteMediaTask(deps: RestoreSiteMediaTaskDeps): Task {
  return async (payload, helpers) => {
    const siteId = siteIdOf(payload);
    const report = await restoreSiteMedia(
      { ...deps, warn: (message) => helpers.logger.warn(message) },
      siteId,
    );
    helpers.logger.info(
      `regravação de ${siteId}: ${report.restored.length} mídias regravadas, ` +
        `${report.written} arquivos gravados, ${report.withoutOriginal.length} sem original`,
    );
  };
}
