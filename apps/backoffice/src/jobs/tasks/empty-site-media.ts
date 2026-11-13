import type { Task } from 'graphile-worker';

import { ORIGINALS_BUCKET, type ObjectStore } from '../../domain/media/store.ts';
import { mediaBucket } from '../../domain/media/variants.ts';

export type EmptySiteMediaTaskDeps = { store: ObjectStore };

function siteIdOf(payload: unknown): string {
  const siteId = (payload as { siteId?: unknown } | null)?.siteId;
  if (typeof siteId !== 'string' || siteId === '') {
    throw new Error(`Payload do esvaziamento sem siteId: ${JSON.stringify(payload)}`);
  }
  return siteId;
}

/**
 * Esvazia `media-<site>` antes do destroy da infra (workspace#97): só o backoffice-worker tem
 * as credenciais S3. Bucket inexistente ou vazio é sucesso (o elo é idempotente). Nunca toca
 * em `media-originals`, nem com o site `originals`. Sobrou objeto (gravação concorrente)?
 * Lança, e o Graphile repete.
 */
export function createEmptySiteMediaTask({ store }: EmptySiteMediaTaskDeps): Task {
  return async (payload, helpers) => {
    const siteId = siteIdOf(payload);
    const bucket = mediaBucket(siteId);
    if (bucket === ORIGINALS_BUCKET) {
      throw new Error(`Esvaziamento recusado: ${bucket} é o bucket dos originais`);
    }
    const keys = await store.list(bucket);
    await store.deleteMany(bucket, keys);
    const left = await store.list(bucket);
    if (left.length > 0) {
      throw new Error(`${bucket} ainda tem ${left.length} objetos depois do esvaziamento`);
    }
    helpers.logger.info(`${bucket} esvaziado: ${keys.length} objetos removidos`);
  };
}
