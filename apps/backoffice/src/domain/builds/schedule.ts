import { eq, sql } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { sites } from '../../db/schema/index.ts';
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

/**
 * Agenda o build do site na mesma transação da gravação. `job_key` + fila nomeada: um build
 * por vez por site, e publicações dentro da janela caem no mesmo job (`preserve_run_at`
 * mantém o horário do primeiro agendamento). Janela: `options.windowMs`, senão a do site,
 * senão a padrão; lida a cada agendamento, sem reiniciar o processo. Chamado por
 * recordPendingChange.
 */
export async function scheduleBuild(
  tx: Executor,
  siteId: string,
  options: { windowMs?: number; now?: Date } = {},
): Promise<void> {
  const delayMs = options.windowMs ?? effectiveBuildWindowMs(await siteWindowSeconds(tx, siteId));
  const runAt = new Date((options.now ?? new Date()).getTime() + delayMs);
  await tx.execute(sql`
    select graphile_worker.add_job(
      identifier => 'build',
      payload => ${JSON.stringify({ siteId })}::json,
      queue_name => ${`build:${siteId}`},
      run_at => ${runAt.toISOString()}::timestamptz,
      max_attempts => 5,
      job_key => ${`build:${siteId}`},
      job_key_mode => 'preserve_run_at'
    )`);
}

async function siteWindowSeconds(tx: Executor, siteId: string): Promise<number | null> {
  const [site] = await tx
    .select({ seconds: sites.buildWindowSeconds })
    .from(sites)
    .where(eq(sites.id, siteId));
  return site?.seconds ?? null;
}

/** "Publicar agora": regrava o job do site para rodar imediatamente. */
export async function buildNow(
  tx: Executor,
  siteId: string,
  now: Date = new Date(),
): Promise<void> {
  await tx.execute(sql`
    select graphile_worker.add_job(
      identifier => 'build',
      payload => ${JSON.stringify({ siteId })}::json,
      queue_name => ${`build:${siteId}`},
      run_at => ${now.toISOString()}::timestamptz,
      max_attempts => 5,
      job_key => ${`build:${siteId}`},
      job_key_mode => 'replace'
    )`);
}

export const ROLLBACK_TASK = 'rollback';

/**
 * Enfileira o rollback do site para a versão pedida, para já. Mesma fila do build
 * (`build:<site>`): os dois nunca rodam ao mesmo tempo. Sem `job_key`: o do build agruparia
 * ou substituiria o pedido.
 */
export async function scheduleRollback(
  tx: Executor,
  siteId: string,
  versionId: string,
): Promise<void> {
  await tx.execute(sql`
    select graphile_worker.add_job(
      identifier => ${ROLLBACK_TASK},
      payload => ${JSON.stringify({ siteId, versionId })}::json,
      queue_name => ${`build:${siteId}`},
      max_attempts => 5
    )`);
}
