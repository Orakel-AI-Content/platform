// Fila da criação da infraestrutura (ADR 0027 da raiz): o plano e o apply rodam no build-runner,
// na fila nomeada `infra:<site>`, um job por vez por site. Fila própria, não a `build:<site>`: a
// recuperação dos builds solta toda trava `build:%` e reexecutaria um apply interrompido. Uma
// tentativa só (`max_attempts => 1`): o plano salvo não se reaplica, e "Tentar de novo" é uma
// execução nova. A recuperação na partida fecha a execução cujo job o processo anterior largou.
import { and, eq, inArray, sql } from 'drizzle-orm';

import type { Db, Executor } from '../../db/client.ts';
import { infraRuns } from '../../db/schema/index.ts';
import { finishInfraRun } from './runs.ts';

export const INFRA_PLAN_TASK = 'infra-plan';
export const INFRA_APPLY_TASK = 'infra-apply';
/**
 * Conferência da infra contra a descrição atual (workspace#98): sem payload, distribui um job
 * por site; com `{ siteId }`, roda o plano descartável do site na fila `infra:<site>`.
 */
export const INFRA_CHECK_TASK = 'infra-check';
/** Chave do job de distribuição: partida e cron no mesmo dia não acumulam duplicados. */
export const INFRA_CHECK_ALL_KEY = 'infra-check:todos';

export const INTERRUPTED_INFRA_MESSAGE =
  'Execução interrompida: o build-runner parou no meio dela. Tente de novo.';

/** Payload das duas tasks. */
export type InfraJobPayload = { siteId: string; runId: number };

async function addInfraJob(
  tx: Executor,
  task: typeof INFRA_PLAN_TASK | typeof INFRA_APPLY_TASK,
  payload: InfraJobPayload,
): Promise<void> {
  await tx.execute(sql`
    select graphile_worker.add_job(
      identifier => ${task},
      payload => ${JSON.stringify(payload)}::json,
      queue_name => ${`infra:${payload.siteId}`},
      max_attempts => 1
    )`);
}

/** Enfileira o plano da execução recém-pedida (`requestInfraRun`), na mesma transação. */
export function scheduleInfraPlan(tx: Executor, payload: InfraJobPayload): Promise<void> {
  return addInfraJob(tx, INFRA_PLAN_TASK, payload);
}

/** Enfileira o apply da execução recém-confirmada (`confirmInfraRun`), na mesma transação. */
export function scheduleInfraApply(tx: Executor, payload: InfraJobPayload): Promise<void> {
  return addInfraJob(tx, INFRA_APPLY_TASK, payload);
}

export type InterruptedInfraRun = { siteId: string; runId: number; jobId: string };

/**
 * Na partida do build-runner (o único que pega estes jobs): todo job de infra travado é de um
 * processo que morreu. A execução aberta do site (uma só, pelo índice único) fecha `falhou` com
 * a etapa em que estava, o job é encerrado sem nova tentativa e as travas são soltas. Execução
 * `aguardando_confirmacao` não tem job rodando e não é tocada.
 */
export async function recoverInterruptedInfraRuns(db: Db): Promise<InterruptedInfraRun[]> {
  return db.transaction(async (tx) => {
    // O site vem do nome da fila: a view pública graphile_worker.jobs não expõe o payload.
    const { rows: jobs } = await tx.execute<{
      id: string;
      site_id: string | null;
      locked_by: string;
    }>(sql`
      select id::text, substring(queue_name from '^infra:(.+)$') as site_id, locked_by
      from graphile_worker.jobs
      where task_identifier in (${INFRA_PLAN_TASK}, ${INFRA_APPLY_TASK}) and locked_by is not null
      order by id`);
    const { rows: queues } = await tx.execute<{ locked_by: string }>(sql`
      select distinct locked_by from graphile_worker._private_job_queues
      where queue_name like 'infra:%' and locked_by is not null`);

    const recovered: InterruptedInfraRun[] = [];
    for (const job of jobs) {
      if (job.site_id === null) continue;
      const [run] = await tx
        .select({ id: infraRuns.id, currentStep: infraRuns.currentStep })
        .from(infraRuns)
        .where(
          and(
            eq(infraRuns.siteId, job.site_id),
            inArray(infraRuns.status, ['planejando', 'aplicando']),
          ),
        );
      if (run === undefined) continue;
      const closed = await finishInfraRun(tx, run.id, {
        status: 'falhou',
        step: run.currentStep,
        message: INTERRUPTED_INFRA_MESSAGE,
      });
      if (closed.ok) recovered.push({ siteId: job.site_id, runId: run.id, jobId: job.id });
    }

    const owners = [...new Set([...jobs, ...queues].map((row) => row.locked_by))];
    if (owners.length > 0) {
      await tx.execute(
        sql`select graphile_worker.force_unlock_workers(${sql.param(owners)}::text[])`,
      );
    }
    if (jobs.length > 0) {
      await tx.execute(sql`select graphile_worker.permanently_fail_jobs(
        ${sql.param(jobs.map((job) => job.id))}::bigint[], ${INTERRUPTED_INFRA_MESSAGE})`);
    }
    return recovered;
  });
}

/**
 * Enfileira a conferência de todos os sites (o job de distribuição, fora das filas de site), na
 * partida do build-runner: um deploy pode ter trazido uma descrição nova.
 */
export async function scheduleInfraCheckAll(tx: Executor): Promise<void> {
  await tx.execute(sql`
    select graphile_worker.add_job(
      identifier => ${INFRA_CHECK_TASK},
      payload => '{}'::json,
      max_attempts => 1,
      job_key => ${INFRA_CHECK_ALL_KEY},
      job_key_mode => 'replace'
    )`);
}

/**
 * Enfileira a conferência de um site na fila `infra:<site>`, para nunca rodar junto com uma
 * criação, remoção ou reaplicação. Uma tentativa só (a próxima é a partida ou o cron) e uma
 * chave por site: uma conferência ainda na fila é substituída, não duplicada.
 */
export async function scheduleSiteInfraDriftCheck(tx: Executor, siteId: string): Promise<void> {
  await tx.execute(sql`
    select graphile_worker.add_job(
      identifier => ${INFRA_CHECK_TASK},
      payload => ${JSON.stringify({ siteId })}::json,
      queue_name => ${`infra:${siteId}`},
      max_attempts => 1,
      job_key => ${`infra-check:${siteId}`},
      job_key_mode => 'replace'
    )`);
}
