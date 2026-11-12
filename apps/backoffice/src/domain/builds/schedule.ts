import { eq, sql } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { builds, sites } from '../../db/schema/index.ts';
import { SYSTEM_ACTOR } from '../access/rbac.ts';
import { processSettings } from '../process-settings.ts';

/**
 * Janela de agrupamento padrão dos builds (proposta): 15 min em produção, 30 s no local. Vem
 * de BUILD_WINDOW_SECONDS, aplicada na partida de cada processo (runProcess e instrumentation
 * do Next); o domínio não lê o ambiente. Um site pode ter a própria (`sites.buildWindowSeconds`).
 * Guardada em `processSettings`, compartilhada pelas cópias do módulo no build do Next.
 */
export function configureBuildWindow(ms: number): void {
  processSettings().buildWindowMs = ms;
}

/**
 * Janela que vale para um site: a própria (segundos, `sites.buildWindowSeconds`), senão a
 * padrão. Única regra de precedência, usada pelo agendamento e pelo registro de instâncias.
 */
export function effectiveBuildWindowMs(siteSeconds: number | null): number {
  return siteSeconds === null ? processSettings().buildWindowMs : siteSeconds * 1000;
}

/** Job como o `add_job` o devolve: o mesmo job quando o pedido de build cai num já na fila. */
type QueuedJob = { id: string; attempts: number; runAt: Date };

type AddedJob = { id: string; attempts: number; run_at: Date | string };

function queuedJob(siteId: string, rows: AddedJob[]): QueuedJob {
  const [job] = rows;
  if (job === undefined) throw new Error(`Execução de ${siteId} não foi enfileirada`);
  return { id: job.id, attempts: job.attempts, runAt: new Date(job.run_at) };
}

async function addBuildJob(
  tx: Executor,
  siteId: string,
  runAt: Date,
  mode: 'preserve_run_at' | 'replace',
): Promise<QueuedJob> {
  const { rows } = await tx.execute<AddedJob>(sql`
    select id::text as id, attempts, run_at from graphile_worker.add_job(
      identifier => 'build',
      payload => ${JSON.stringify({ siteId })}::json,
      queue_name => ${`build:${siteId}`},
      run_at => ${runAt.toISOString()}::timestamptz,
      max_attempts => 5,
      job_key => ${`build:${siteId}`},
      job_key_mode => ${mode}
    )`);
  return queuedJob(siteId, rows);
}

/** Tipo da linha e, no rollback, a versão de destino. */
export type QueuedRun = { kind: 'build' } | { kind: 'rollback'; versionId: string };

/**
 * Grava a linha `na_fila` do job, ou atualiza a que ele já tem (índice único parcial em
 * `job_id`): pedidos que caem no mesmo job caem na mesma linha. `requestedBy` só troca quando
 * o pedido regrava o horário ("Publicar agora"); o agendamento automático mantém quem pediu.
 * Sem `run`, a linha é de build.
 */
export async function recordQueuedBuild(
  tx: Executor,
  siteId: string,
  job: QueuedJob,
  requestedBy: string,
  options: { replaceRequester: boolean; run?: QueuedRun },
): Promise<void> {
  const attempt = job.attempts + 1;
  const run = options.run ?? { kind: 'build' };
  await tx
    .insert(builds)
    .values({
      siteId,
      kind: run.kind,
      jobId: job.id,
      attempt,
      status: 'na_fila',
      requestedBy,
      scheduledFor: job.runAt,
      ...(run.kind === 'rollback' && { versionId: run.versionId }),
    })
    .onConflictDoUpdate({
      target: builds.jobId,
      targetWhere: sql`${builds.status} = 'na_fila'`,
      set: {
        attempt,
        scheduledFor: job.runAt,
        ...(options.replaceRequester && { requestedBy }),
      },
    });
}

/**
 * Agenda o build do site na mesma transação da gravação. `job_key` + fila nomeada: um build
 * por vez por site, e publicações dentro da janela caem no mesmo job (`preserve_run_at`
 * mantém o horário do primeiro agendamento) e na mesma linha `na_fila`, pedida por `system`.
 * Janela: `options.windowMs`, senão a do site, senão a padrão; lida a cada agendamento, sem
 * reiniciar o processo. Chamado por recordPendingChange.
 */
export async function scheduleBuild(
  tx: Executor,
  siteId: string,
  options: { windowMs?: number; now?: Date } = {},
): Promise<void> {
  const delayMs = options.windowMs ?? effectiveBuildWindowMs(await siteWindowSeconds(tx, siteId));
  const runAt = new Date((options.now ?? new Date()).getTime() + delayMs);
  const job = await addBuildJob(tx, siteId, runAt, 'preserve_run_at');
  await recordQueuedBuild(tx, siteId, job, SYSTEM_ACTOR.email, { replaceRequester: false });
}

async function siteWindowSeconds(tx: Executor, siteId: string): Promise<number | null> {
  const [site] = await tx
    .select({ seconds: sites.buildWindowSeconds })
    .from(sites)
    .where(eq(sites.id, siteId));
  return site?.seconds ?? null;
}

/**
 * "Publicar agora", "Retomar" e "Reconstruir": regrava o job do site para rodar
 * imediatamente, e a linha `na_fila` passa a ter o horário de agora e quem pediu.
 */
export async function buildNow(
  tx: Executor,
  siteId: string,
  requestedBy: string,
  now: Date = new Date(),
): Promise<void> {
  const job = await addBuildJob(tx, siteId, now, 'replace');
  await recordQueuedBuild(tx, siteId, job, requestedBy, { replaceRequester: true });
}

/**
 * "Cancelar" na fila: tira da fila o job de build do site (`job_key` `build:<site>`), desde que
 * seja o job da linha e ninguém o tenha pegado. Trava a linha do job antes (o worker pega com
 * `skip locked`, então não a leva no meio) e devolve `false` quando ele já está travado ou não
 * existe: `remove_job` num job travado zeraria a chave e cortaria as repetições do que roda.
 */
export async function removeQueuedBuildJob(
  tx: Executor,
  siteId: string,
  jobId: string,
): Promise<boolean> {
  const key = `build:${siteId}`;
  const { rows } = await tx.execute<{ locked_at: Date | string | null }>(sql`
    select locked_at from graphile_worker._private_jobs
    where id = ${jobId}::bigint and key = ${key}
    for update`);
  const [job] = rows;
  if (job === undefined || job.locked_at !== null) return false;
  await tx.execute(sql`select graphile_worker.remove_job(${key})`);
  return true;
}

/**
 * Horário da próxima tentativa depois de uma falha: a mesma conta de backoff do Graphile
 * Worker (`greatest(now, run_at) + exp(least(attempts, 10))` segundos). A linha `na_fila` da
 * repetição sai daqui, sem ler a fila.
 */
export function retryRunAt(runAt: Date, attempts: number, now: Date): Date {
  const base = Math.max(now.getTime(), runAt.getTime());
  return new Date(base + Math.exp(Math.min(attempts, 10)) * 1000);
}

export const ROLLBACK_TASK = 'rollback';

/**
 * Enfileira o rollback do site para a versão pedida, para já, e grava a linha `na_fila` dele
 * (tipo rollback, quem pediu, versão de destino) na mesma transação. Mesma fila do build
 * (`build:<site>`): os dois nunca rodam ao mesmo tempo. Sem `job_key`: o do build agruparia
 * ou substituiria o pedido.
 */
export async function scheduleRollback(
  tx: Executor,
  siteId: string,
  versionId: string,
  requestedBy: string,
): Promise<void> {
  const { rows } = await tx.execute<AddedJob>(sql`
    select id::text as id, attempts, run_at from graphile_worker.add_job(
      identifier => ${ROLLBACK_TASK},
      payload => ${JSON.stringify({ siteId, versionId })}::json,
      queue_name => ${`build:${siteId}`},
      max_attempts => 5
    )`);
  await recordQueuedBuild(tx, siteId, queuedJob(siteId, rows), requestedBy, {
    replaceRequester: false,
    run: { kind: 'rollback', versionId },
  });
}
