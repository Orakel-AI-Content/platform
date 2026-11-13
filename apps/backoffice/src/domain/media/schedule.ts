// Fila da regravação das variantes registradas (workspace#97): o `ok` da criação da infra a
// enfileira na mesma transação, e o backoffice-worker a executa (`restoreSiteMedia`). Módulo sem
// `sharp`: o `finishInfraRun` o importa, e ele chega ao histórico do site no navegador.
import { sql } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';

export const RESTORE_MEDIA_TASK = 'restore-site-media';

/**
 * Enfileira a regravação das variantes do site; com o mesmo `job_key`, pedir de novo enquanto o
 * job espera na fila não cria outro.
 */
export async function enqueueRestoreMedia(tx: Executor, siteId: string): Promise<void> {
  await tx.execute(sql`
    select graphile_worker.add_job(
      identifier => ${RESTORE_MEDIA_TASK},
      payload => ${JSON.stringify({ siteId })}::json,
      max_attempts => 5,
      job_key => ${`${RESTORE_MEDIA_TASK}:${siteId}`},
      job_key_mode => 'preserve_run_at'
    )`);
}
