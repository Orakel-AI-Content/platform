import type { Task } from 'graphile-worker';

import type { Db } from '../../db/client.ts';
import { publishScheduledVersion } from '../../domain/publications/publish.ts';
import type { PublishScheduledPayload } from '../../domain/publications/schedule.ts';

export type PublishScheduledTaskDeps = { db: Db };

function payloadOf(payload: unknown): PublishScheduledPayload {
  const { siteId, contentId, version } = (payload ?? {}) as Partial<
    Record<keyof PublishScheduledPayload, unknown>
  >;
  if (
    typeof siteId !== 'string' ||
    siteId === '' ||
    !Number.isInteger(contentId) ||
    !Number.isInteger(version)
  ) {
    throw new Error(`Payload da publicação agendada inválido: ${JSON.stringify(payload)}`);
  }
  return { siteId, contentId: contentId as number, version: version as number };
}

/**
 * Publicação agendada (workspace#20, R3): no horário marcado, leva a versão `agendado` a
 * `publicado` e registra a mudança pendente, sem ação humana e sem reconferir o limite. Falha
 * de banco lança e o Graphile Worker repete o job.
 */
export function createPublishScheduledTask(deps: PublishScheduledTaskDeps): Task {
  return async (payload, helpers) => {
    const { siteId, contentId, version } = payloadOf(payload);
    const outcome = await deps.db.transaction((tx) =>
      publishScheduledVersion(tx, siteId, contentId, version),
    );
    if (outcome === 'published') {
      helpers.logger.info(`conteúdo ${contentId} v${version} de ${siteId} publicado no horário`);
    } else {
      helpers.logger.warn(
        `publicação agendada de ${siteId}/${contentId} v${version} ignorada: a versão não está agendada`,
      );
    }
  };
}
