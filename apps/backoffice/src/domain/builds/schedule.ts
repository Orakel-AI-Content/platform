import { eq, sql } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { sites } from '../../db/schema/index.ts';

/**
 * Janela de agrupamento padrão dos builds (proposta): 15 min em produção, 30 s no local. Vem
 * de BUILD_WINDOW_SECONDS, aplicada na partida de cada processo (runProcess e instrumentation
 * do Next); o domínio não lê o ambiente. Um site pode ter a própria (`sites.buildWindowSeconds`).
 */
let windowMs = 15 * 60_000;

export function configureBuildWindow(ms: number): void {
  windowMs = ms;
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
  const delayMs = options.windowMs ?? (await siteWindowMs(tx, siteId)) ?? windowMs;
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

async function siteWindowMs(tx: Executor, siteId: string): Promise<number | undefined> {
  const [site] = await tx
    .select({ seconds: sites.buildWindowSeconds })
    .from(sites)
    .where(eq(sites.id, siteId));
  const seconds = site?.seconds ?? undefined;
  return seconds === undefined ? undefined : seconds * 1000;
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
