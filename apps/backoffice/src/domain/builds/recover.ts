// Recuperação na partida do build-runner (#453). O Graphile Worker só solta a trava de um
// worker morto depois de 4 h, e a fila build:<site> deixa o site sem build até lá. Só existe
// um build-runner por ambiente e o compose para o antigo antes de subir o novo, então toda
// trava de fila build:% ou de job `build` ou `rollback` (a mesma fila) presente na partida é
// de um processo que morreu no meio da tentativa: a linha `rodando` dela é fechada como
// `failed`/`transient` e os donos são destravados. Se o processo morreu antes de gravar a
// linha, ela é inserida já fechada, com o tipo do job.
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';

import type { Db, Executor } from '../../db/client.ts';
import { builds, type BuildKind } from '../../db/schema/index.ts';
import { loadBuildTarget } from './builds.ts';
import { ROLLBACK_TASK } from './schedule.ts';

export const INTERRUPTED_MESSAGE = 'build interrompido: o build-runner parou no meio da tentativa';
export const INTERRUPTED_ROLLBACK_MESSAGE =
  'rollback interrompido: o build-runner parou no meio da tentativa';

export type InterruptedBuild = {
  kind: BuildKind;
  siteId: string;
  jobId: string;
  attempt: number;
  lockedBy: string;
};

type LockedJob = {
  id: string;
  task_identifier: string;
  site_id: string | null;
  attempts: number;
  locked_at: Date | string;
  locked_by: string;
};

/**
 * Fecha a linha de cada tentativa de build ou de rollback interrompida (ou a registra, se não
 * havia linha) e libera as travas dos workers donos, numa transação. Devolve as tentativas
 * registradas; travas de outras tasks não são tocadas.
 */
export async function recoverInterruptedBuilds(
  db: Db,
  defaultTag: string,
): Promise<InterruptedBuild[]> {
  return db.transaction(async (tx) => {
    // O site vem do nome da fila (build:<site>, de scheduleBuild e buildNow): a view pública
    // graphile_worker.jobs não expõe o payload.
    const { rows: jobs } = await tx.execute<LockedJob>(sql`
      select id::text, task_identifier, substring(queue_name from '^build:(.+)$') as site_id,
        attempts, locked_at, locked_by
      from graphile_worker.jobs
      where task_identifier in ('build', ${ROLLBACK_TASK}) and locked_by is not null
      order by id`);
    const { rows: queues } = await tx.execute<{ locked_by: string }>(sql`
      select distinct locked_by from graphile_worker._private_job_queues
      where queue_name like 'build:%' and locked_by is not null`);

    const recorded: InterruptedBuild[] = [];
    for (const job of jobs) {
      if (job.site_id === null) continue;
      const target = await loadBuildTarget(tx, job.site_id);
      if (target === undefined) continue;
      const kind: BuildKind = job.task_identifier === ROLLBACK_TASK ? 'rollback' : 'build';
      const interrupted = {
        status: 'failed' as const,
        failedStage: null,
        failureKind: 'transient' as const,
        failureMessage: kind === 'rollback' ? INTERRUPTED_ROLLBACK_MESSAGE : INTERRUPTED_MESSAGE,
        finishedAt: new Date(),
      };
      const closed = await tx
        .update(builds)
        .set(interrupted)
        .where(
          and(
            eq(builds.kind, kind),
            eq(builds.jobId, job.id),
            eq(builds.attempt, job.attempts),
            eq(builds.status, 'rodando'),
          ),
        )
        .returning({ id: builds.id });
      if (closed.length === 0) {
        await tx.insert(builds).values({
          ...interrupted,
          siteId: job.site_id,
          release: target.release ?? defaultTag,
          kind,
          jobId: job.id,
          attempt: job.attempts,
          startedAt: new Date(job.locked_at),
          // A versão de destino do rollback vem da linha `na_fila` do job (a view não tem o payload).
          ...(kind === 'rollback' && { versionId: await queuedVersion(tx, job.id) }),
        });
      }
      recorded.push({
        kind,
        siteId: job.site_id,
        jobId: job.id,
        attempt: job.attempts,
        lockedBy: job.locked_by,
      });
    }

    const owners = [...new Set([...jobs, ...queues].map((row) => row.locked_by))];
    if (owners.length > 0) {
      await tx.execute(
        sql`select graphile_worker.force_unlock_workers(${sql.param(owners)}::text[])`,
      );
    }
    return recorded;
  });
}

async function queuedVersion(tx: Executor, jobId: string): Promise<string | null> {
  const [row] = await tx
    .select({ versionId: builds.versionId })
    .from(builds)
    .where(and(eq(builds.jobId, jobId), eq(builds.kind, 'rollback'), isNotNull(builds.versionId)))
    .orderBy(desc(builds.id))
    .limit(1);
  return row?.versionId ?? null;
}
