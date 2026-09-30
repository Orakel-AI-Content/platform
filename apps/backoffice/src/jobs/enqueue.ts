import { sql } from 'drizzle-orm';

import type { Executor } from '../db/client.ts';

/** Janela de agrupamento dos builds (proposta): 15 min em produção, 30 s no local. */
export const BUILD_WINDOW_MS = process.env.NODE_ENV === 'production' ? 15 * 60_000 : 30_000;

/**
 * Agenda o build do site na mesma transação da gravação. `job_key` + fila nomeada: um build
 * por vez por site, e publicações dentro da janela caem no mesmo job (`preserve_run_at`
 * mantém o horário do primeiro agendamento). Usado pelo módulo Publicação (backlog).
 */
export async function scheduleBuild(
  tx: Executor,
  siteId: string,
  options: { windowMs?: number; now?: Date } = {},
): Promise<void> {
  const runAt = new Date(
    (options.now ?? new Date()).getTime() + (options.windowMs ?? BUILD_WINDOW_MS),
  );
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
