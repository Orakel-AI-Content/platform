import type { Task } from 'graphile-worker';

import type { Db } from '../../db/client.ts';
import type { ObjectStore } from '../../domain/media/store.ts';
import { registerMediaVariants, type VariantsPayload } from '../../domain/media/variants.ts';

export type MediaVariantsTaskDeps = { db: Db; store: ObjectStore };

function payloadOf(payload: unknown): VariantsPayload {
  const { siteId, originalKey, width, height } = (payload ?? {}) as Partial<
    Record<keyof VariantsPayload, unknown>
  >;
  const dimension = (value: unknown) =>
    typeof value === 'number' && Number.isInteger(value) && value > 0;
  if (
    typeof siteId !== 'string' ||
    siteId === '' ||
    typeof originalKey !== 'string' ||
    !dimension(width) ||
    !dimension(height)
  ) {
    throw new Error(`Payload das variantes inválido: ${JSON.stringify(payload)}`);
  }
  return { siteId, originalKey, width: width as number, height: height as number };
}

/** Variantes do perfil de imagem e registro da mídia (12.0, L4); falha lança e repete. */
export function createMediaVariantsTask(deps: MediaVariantsTaskDeps): Task {
  return async (payload, helpers) => {
    const input = payloadOf(payload);
    const result = await registerMediaVariants(deps, input);
    if (result.status === 'missing') {
      helpers.logger.warn(`variantes de ${input.originalKey} ignoradas: original não existe`);
      return;
    }
    helpers.logger.info(
      `mídia ${result.id} de ${input.siteId}: ${result.variants} variantes (${result.written} novas)`,
    );
  };
}
