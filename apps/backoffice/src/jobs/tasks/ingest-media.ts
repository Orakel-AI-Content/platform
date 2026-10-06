import type { Task } from 'graphile-worker';

import { ingestUpload } from '../../domain/media/ingest.ts';
import type { ObjectStore } from '../../domain/media/store.ts';
import type { IngestPayload } from '../../domain/media/upload.ts';
import { VARIANTS_TASK, type VariantsPayload } from '../../domain/media/variants.ts';

export type IngestMediaTaskDeps = { store: ObjectStore };

function payloadOf(payload: unknown): IngestPayload {
  const { siteId, uploadKey } = (payload ?? {}) as Partial<Record<keyof IngestPayload, unknown>>;
  if (typeof siteId !== 'string' || siteId === '' || typeof uploadKey !== 'string') {
    throw new Error(`Payload da ingestão inválido: ${JSON.stringify(payload)}`);
  }
  return { siteId, uploadKey };
}

/**
 * Ingestão de uma imagem enviada (12.0, L4), encadeando as variantes do perfil de imagem;
 * falha lança e o Graphile Worker repete.
 */
export function createIngestMediaTask(deps: IngestMediaTaskDeps): Task {
  return async (payload, helpers) => {
    const input = payloadOf(payload);
    const result = await ingestUpload(deps.store, input);
    if (result.status === 'missing') {
      helpers.logger.warn(`ingestão de ${input.uploadKey} ignorada: envio não existe mais`);
      return;
    }
    helpers.logger.info(
      `original de ${input.siteId} em ${result.key} (${result.width}x${result.height})`,
    );
    const next: VariantsPayload = {
      siteId: input.siteId,
      originalKey: result.key,
      width: result.width,
      height: result.height,
    };
    await helpers.addJob(VARIANTS_TASK, next, { maxAttempts: 5 });
  };
}
