// Fila da infraestrutura do site (ADR 0027 da raiz): o plano e o apply rodam no build-runner, na
// fila nomeada `infra:<site>`, um job por vez por site. Fila própria, não a `build:<site>`: a
// recuperação dos builds solta toda trava `build:%` e reexecutaria um apply interrompido. Uma
// tentativa só (`max_attempts => 1`): o plano salvo não se reaplica, e "Tentar de novo" é uma
// execução nova. A recuperação na partida fecha a execução cujo job o processo anterior largou.
//
// A remoção (workspace#97) é uma cadeia na mesma fila, atravessando dois processos: o build-runner
// apaga o Worker (`infra-remove-worker`), o backoffice-worker esvazia `media-<site>`
// (`empty-site-media`, o único com as credenciais S3 da mídia) e o build-runner aplica o plano de
// destruição (`infra-apply`). Cada elo enfileira o próximo na mesma transação em que grava a etapa.
import { and, eq, inArray, sql } from 'drizzle-orm';

import type { Db, Executor } from '../../db/client.ts';
import { infraRuns } from '../../db/schema/index.ts';
import { EMPTY_SITE_MEDIA_TASK } from '../media/variants.ts';
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
export const INFRA_REMOVE_WORKER_TASK = 'infra-remove-worker';

export const INTERRUPTED_INFRA_MESSAGE =
  'Execução interrompida: o build-runner parou no meio dela. Tente de novo.';
export const INTERRUPTED_WORKER_INFRA_MESSAGE =
  'Execução interrompida: o backoffice-worker parou no meio dela. Tente de novo.';

/** Payload das tasks da fila `infra:<site>`. */
export type InfraJobPayload = { siteId: string; runId: number };

type InfraTask =
  | typeof INFRA_PLAN_TASK
  | typeof INFRA_APPLY_TASK
  | typeof INFRA_REMOVE_WORKER_TASK
  | typeof EMPTY_SITE_MEDIA_TASK;

async function addInfraJob(tx: Executor, task: InfraTask, payload: InfraJobPayload): Promise<void> {
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

/**
 * Enfileira o apply da execução recém-confirmada (`confirmInfraRun`) ou, na remoção, depois do
 * esvaziamento da mídia; na mesma transação.
 */
export function scheduleInfraApply(tx: Executor, payload: InfraJobPayload): Promise<void> {
  return addInfraJob(tx, INFRA_APPLY_TASK, payload);
}

/** Elo 1 da remoção, enfileirado pela confirmação (`confirmInfraRemoval`), na mesma transação. */
export function scheduleInfraRemoveWorker(tx: Executor, payload: InfraJobPayload): Promise<void> {
  return addInfraJob(tx, INFRA_REMOVE_WORKER_TASK, payload);
}

/** Elo 2 da remoção, enfileirado pelo elo 1 depois de apagar o Worker, na mesma transação. */
export function scheduleEmptySiteMedia(tx: Executor, payload: InfraJobPayload): Promise<void> {
  return addInfraJob(tx, EMPTY_SITE_MEDIA_TASK, payload);
}

/** O que cada processo recupera na partida: só os jobs das próprias tasks da fila `infra:<site>`. */
export type InfraRecovery = { tasks: readonly InfraTask[]; message: string };

export const BUILD_RUNNER_INFRA_RECOVERY: InfraRecovery = {
  tasks: [INFRA_PLAN_TASK, INFRA_APPLY_TASK, INFRA_REMOVE_WORKER_TASK],
  message: INTERRUPTED_INFRA_MESSAGE,
};

export const WORKER_INFRA_RECOVERY: InfraRecovery = {
  tasks: [EMPTY_SITE_MEDIA_TASK],
  message: INTERRUPTED_WORKER_INFRA_MESSAGE,
};

export type InterruptedInfraRun = { siteId: string; runId: number; jobId: string };

/**
 * Na partida do processo: todo job travado das tasks dele na fila `infra:<site>` é de uma instância
 * que morreu (só ele pega esses jobs). A execução aberta do site (uma só, pelo índice único) fecha
 * `falhou` com a etapa em que estava, o job é encerrado sem nova tentativa e as travas dos donos
 * desses jobs são soltas. Jobs do outro processo na mesma fila não são tocados: o elo da remoção
 * que ele está rodando segue travado. Execução `aguardando_confirmacao` não tem job rodando.
 */
export async function recoverInterruptedInfraRuns(
  db: Db,
  recovery: InfraRecovery = BUILD_RUNNER_INFRA_RECOVERY,
): Promise<InterruptedInfraRun[]> {
  return db.transaction(async (tx) => {
    // O site vem do nome da fila: a view pública graphile_worker.jobs não expõe o payload.
    const { rows: jobs } = await tx.execute<{
      id: string;
      site_id: string | null;
      locked_by: string;
    }>(sql`
      select id::text, substring(queue_name from '^infra:(.+)$') as site_id, locked_by
      from graphile_worker.jobs
      where task_identifier in (${sql.join(
        recovery.tasks.map((task) => sql`${task}`),
        sql`, `,
      )})
        and queue_name like 'infra:%' and locked_by is not null
      order by id`);

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
        message: recovery.message,
      });
      if (closed.ok) recovered.push({ siteId: job.site_id, runId: run.id, jobId: job.id });
    }

    // Só os donos dos jobs acima: soltar toda trava `infra:%` derrubaria o elo vivo do outro
    // processo. O force_unlock_workers também solta a fila travada por esses donos.
    const owners = [...new Set(jobs.map((row) => row.locked_by))];
    if (owners.length > 0) {
      await tx.execute(
        sql`select graphile_worker.force_unlock_workers(${sql.param(owners)}::text[])`,
      );
    }
    if (jobs.length > 0) {
      await tx.execute(sql`select graphile_worker.permanently_fail_jobs(
        ${sql.param(jobs.map((job) => job.id))}::bigint[], ${recovery.message})`);
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
