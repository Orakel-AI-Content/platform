import type { Task } from 'graphile-worker';

import type { Executor } from '../../db/client.ts';
import { ingestUpload } from '../../domain/media/ingest.ts';
import type { ObjectStore } from '../../domain/media/store.ts';
import { closeUpload, FAILED_REASON, type IngestPayload } from '../../domain/media/upload.ts';
import { VARIANTS_TASK, type VariantsPayload } from '../../domain/media/variants.ts';
import { isLastAttempt } from './last-attempt.ts';

export type IngestMediaTaskDeps = { db: Executor; store: ObjectStore };

function payloadOf(payload: unknown): IngestPayload {
  const { siteId, uploadKey } = (payload ?? {}) as Partial<Record<keyof IngestPayload, unknown>>;
  if (typeof siteId !== 'string' || siteId === '' || typeof uploadKey !== 'string') {
    throw new Error(`Payload da ingestão inválido: ${JSON.stringify(payload)}`);
  }
  return { siteId, uploadKey };
}

/**
 * Ingestão de uma imagem enviada (12.0, L4), encadeando as variantes do perfil de imagem com
 * a chave do envio. Arquivo ilegível fecha o envio como recusado sem repetir (#185); outra
 * falha lança e o Graphile Worker repete, e a última tentativa fecha o envio como recusado.
 */
export function createIngestMediaTask(deps: IngestMediaTaskDeps): Task {
  return async (payload, helpers) => {
    const input = payloadOf(payload);
    try {
      const result = await ingestUpload(deps.store, input);
      if (result.status === 'missing') {
        helpers.logger.warn(`ingestão de ${input.uploadKey} ignorada: envio não existe mais`);
        return;
      }
      if (result.status === 'rejected') {
        await closeUpload(deps.db, input, { status: 'recusada', reason: result.reason });
        helpers.logger.warn(`envio ${input.uploadKey} recusado: ${result.reason}`);
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
        uploadKey: input.uploadKey,
      };
      await helpers.addJob(VARIANTS_TASK, next, { maxAttempts: 5 });
    } catch (error) {
      if (isLastAttempt(helpers)) {
        await closeUpload(deps.db, input, { status: 'recusada', reason: FAILED_REASON });
      }
      throw error;
    }
  };
}
