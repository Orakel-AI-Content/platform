import { sql } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';

/**
 * Janela de agrupamento dos builds (proposta): 15 min em produção, 30 s no local. Vem de
 * BUILD_WINDOW_SECONDS, aplicada na partida de cada processo (runProcess e instrumentation
 * do Next); o domínio não lê o ambiente.
 */
let windowMs = 15 * 60_000;

export function configureBuildWindow(ms: number): void {
  windowMs = ms;
}

/**
 * Agenda o build do site na mesma transação da gravação. `job_key` + fila nomeada: um build
 * por vez por site, e publicações dentro da janela caem no mesmo job (`preserve_run_at`
 * mantém o horário do primeiro agendamento). Chamado por recordPendingChange.
 */
export async function scheduleBuild(
  tx: Executor,
  siteId: string,
  options: { windowMs?: number; now?: Date } = {},
): Promise<void> {
  const runAt = new Date((options.now ?? new Date()).getTime() + (options.windowMs ?? windowMs));
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
