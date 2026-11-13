import type { Task } from 'graphile-worker';

import type { Db } from '../../db/client.ts';
import { loadBuildTarget } from '../../domain/builds/builds.ts';
import {
  recordInfraDrift,
  sitesForInfraDrift,
  type InfraDriftOutcome,
} from '../../domain/builds/site-state.ts';
import { planHasChanges, type InfraDriver } from '../../domain/infra/drivers.ts';
import { hasOpenInfraRun } from '../../domain/infra/runs.ts';
import { scheduleSiteInfraDriftCheck } from '../../domain/infra/schedule.ts';

/** `now` em milissegundos, como o do build (as duas tasks dividem as deps do build-runner). */
export type InfraCheckTaskDeps = { db: Db; infra: InfraDriver; now?: () => number };

function siteIdOf(payload: unknown): string | undefined {
  const siteId = (payload as { siteId?: unknown } | null)?.siteId;
  if (siteId === undefined) return undefined;
  if (typeof siteId !== 'string' || siteId === '') {
    throw new Error(`Payload da conferência da infra inválido: ${JSON.stringify(payload)}`);
  }
  return siteId;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Conferência da infra contra a descrição atual (workspace#98, build-runner). Sem payload
 * (partida e cron diário), enfileira um job por site de `infra_aplicada` em diante, cada um na
 * fila `infra:<site>`: assim nunca roda junto com uma criação, remoção ou reaplicação, e a falha
 * de um site não atrapalha os outros. Com `{ siteId }`, pula o site que tem execução de infra
 * aberta ou que deixou de ser elegível; senão, roda o plano descartável e grava o resultado
 * (`em_dia`, `desatualizado` com o resumo do plano, ou `falhou` com o motivo). Nada é aplicado.
 */
export function createInfraCheckTask(deps: InfraCheckTaskDeps): Task {
  const now = deps.now ?? Date.now;
  return async (payload, helpers) => {
    const log = helpers.logger;
    const siteId = siteIdOf(payload);
    if (siteId === undefined) {
      const siteIds = await sitesForInfraDrift(deps.db);
      await deps.db.transaction(async (tx) => {
        for (const id of siteIds) await scheduleSiteInfraDriftCheck(tx, id);
      });
      log.info(`conferência da infra enfileirada para ${siteIds.length} site(s)`);
      return;
    }

    if (!(await sitesForInfraDrift(deps.db)).includes(siteId)) {
      log.info(`conferência da infra de ${siteId} pulada: infra não aplicada`);
      return;
    }
    if (await hasOpenInfraRun(deps.db, siteId)) {
      log.info(`conferência da infra de ${siteId} pulada: execução de infra aberta`);
      return;
    }

    let outcome: InfraDriftOutcome;
    try {
      const target = await loadBuildTarget(deps.db, siteId);
      const planned = await deps.infra.check({ siteId, domain: target?.domain ?? '' });
      outcome =
        planned.status === 'failed'
          ? { kind: 'falhou', message: planned.failure.message }
          : planHasChanges(planned.summary)
            ? { kind: 'desatualizado', summary: JSON.stringify(planned.summary) }
            : { kind: 'em_dia' };
    } catch (error) {
      outcome = { kind: 'falhou', message: `Erro inesperado na conferência: ${message(error)}` };
    }
    await deps.db.transaction((tx) => recordInfraDrift(tx, siteId, outcome, new Date(now())));
    if (outcome.kind === 'falhou') {
      log.warn(`conferência da infra de ${siteId} falhou: ${outcome.message}`);
    } else {
      log.info(`infra de ${siteId} (driver ${deps.infra.kind}): ${outcome.kind}`);
    }
  };
}
