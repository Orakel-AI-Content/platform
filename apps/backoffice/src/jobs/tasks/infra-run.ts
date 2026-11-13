import type { Db } from '../../db/client.ts';
import type { InfraDriver } from '../../domain/infra/drivers.ts';
import type { InfraJobPayload } from '../../domain/infra/schedule.ts';

export type InfraTaskDeps = { db: Db; infra: InfraDriver };

/** Payload das tasks `infra-plan` e `infra-apply`: o site e a execução em `infra_runs`. */
export function infraPayloadOf(payload: unknown, task: string): InfraJobPayload {
  const { siteId, runId } = (payload ?? {}) as { siteId?: unknown; runId?: unknown };
  if (typeof siteId !== 'string' || siteId === '' || !Number.isInteger(runId)) {
    throw new Error(`Payload do ${task} sem siteId ou runId: ${JSON.stringify(payload)}`);
  }
  return { siteId, runId: runId as number };
}
