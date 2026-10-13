import type { Task } from 'graphile-worker';

import type { Db } from '../../db/client.ts';
import type { ObjectStore } from '../../domain/media/store.ts';
import { closeUpload, FAILED_REASON } from '../../domain/media/upload.ts';
import { registerMediaVariants, type VariantsPayload } from '../../domain/media/variants.ts';
import { isLastAttempt } from './last-attempt.ts';

export type MediaVariantsTaskDeps = { db: Db; store: ObjectStore };

function payloadOf(payload: unknown): VariantsPayload {
  const { siteId, originalKey, width, height, uploadKey } = (payload ?? {}) as Partial<
    Record<keyof VariantsPayload, unknown>
  >;
  const dimension = (value: unknown) =>
    typeof value === 'number' && Number.isInteger(value) && value > 0;
  if (
    typeof siteId !== 'string' ||
    siteId === '' ||
    typeof originalKey !== 'string' ||
    !dimension(width) ||
    !dimension(height) ||
    // Jobs anteriores à #185 não trazem a chave do envio.
    (uploadKey !== undefined && (typeof uploadKey !== 'string' || uploadKey === ''))
  ) {
    throw new Error(`Payload das variantes inválido: ${JSON.stringify(payload)}`);
  }
  return {
    siteId,
    originalKey,
    width: width as number,
    height: height as number,
    ...(uploadKey === undefined ? {} : { uploadKey }),
  };
}

/**
 * Variantes do perfil de imagem e registro da mídia (12.0, L4), que fecha o envio como pronto;
 * falha lança e repete, e a última tentativa fecha o envio como recusado (#185).
 */
export function createMediaVariantsTask(deps: MediaVariantsTaskDeps): Task {
  return async (payload, helpers) => {
    const input = payloadOf(payload);
    try {
      const result = await registerMediaVariants(deps, input);
      if (result.status === 'missing') {
        helpers.logger.warn(`variantes de ${input.originalKey} ignoradas: original não existe`);
        return;
      }
      helpers.logger.info(
        `mídia ${result.id} de ${input.siteId}: ${result.variants} variantes (${result.written} novas)`,
      );
    } catch (error) {
      // Última tentativa: o envio que originou o job termina recusado (#185).
      if (input.uploadKey !== undefined && isLastAttempt(helpers)) {
        await closeUpload(
          deps.db,
          { siteId: input.siteId, uploadKey: input.uploadKey },
          { status: 'recusada', reason: FAILED_REASON },
        );
      }
      throw error;
    }
  };
}
