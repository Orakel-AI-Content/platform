import type { Task } from 'graphile-worker';

import type { Db } from '../../db/client.ts';
import type { GenerationSettings } from '../../domain/generation/generate.ts';
import { opine } from '../../domain/reviews/opinion.ts';
import {
  opinionInputFor,
  recordOpinion,
  type OpinionTarget,
} from '../../domain/reviews/opinions.ts';

export type ReviewOpinionTaskDeps = {
  db: Db;
  generation: GenerationSettings;
  now?: () => Date;
};

function targetOf(payload: unknown): OpinionTarget {
  const { siteId, contentId, version } = (payload ?? {}) as Partial<
    Record<keyof OpinionTarget, unknown>
  >;
  const positive = (value: unknown): value is number =>
    Number.isInteger(value) && Number(value) > 0;
  if (typeof siteId !== 'string' || siteId === '' || !positive(contentId) || !positive(version)) {
    throw new Error(`Payload do parecer inválido: ${JSON.stringify(payload)}`);
  }
  return { siteId, contentId, version };
}

/**
 * Parecer automático de uma versão em revisão (workspace#94): lê a versão e o contexto
 * editorial vigente, chama `opine` uma vez e grava o desfecho, `ok` ou `falha`, sem lançar.
 * Uma tentativa só (`max_attempts => 1` no enfileiramento).
 */
export function createReviewOpinionTask(deps: ReviewOpinionTaskDeps): Task {
  const now = deps.now ?? (() => new Date());
  return async (payload, helpers) => {
    const target = targetOf(payload);
    const label = `${target.siteId}/${target.contentId} v${target.version}`;
    const input = await opinionInputFor(deps.db, target);
    if (input === undefined) {
      helpers.logger.warn(`parecer de ${label} pulado: a versão não existe`);
      return;
    }
    const result = await opine(
      { data: input.data, editorialContext: input.editorialContext?.body ?? null },
      deps.generation,
    );
    const recorded = await recordOpinion(
      deps.db,
      target,
      { result, editorialContextVersion: input.editorialContext?.version ?? null },
      now(),
    );
    if (!recorded) {
      helpers.logger.warn(`parecer de ${label} ignorado: não existe ou já terminou`);
    } else if (result.ok) {
      helpers.logger.info(`parecer de ${label}: ok`);
    } else {
      helpers.logger.warn(
        `parecer de ${label}: falha (${result.issues.map((issue) => issue.code).join(', ')})`,
      );
    }
  };
}
