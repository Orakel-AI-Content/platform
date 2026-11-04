// Agendamento da consolidação da audiência (#547): o cron horário do backoffice-worker e o
// comando da operação enfileiram o mesmo job, na fila `audience`, e a task consolida a janela
// padrão. A fila serializa as rodadas (as duas regravam os mesmos dias); sem `job_key`, para
// o pedido da operação nunca ser absorvido por um job do cron ainda pendente.
import { sql } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { AUDIENCE_TIME_ZONE, type DayWindow } from './aggregate.ts';

export const AGGREGATE_AUDIENCE_TASK = 'aggregate-audience';
export const AUDIENCE_QUEUE = 'audience';

const localDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: AUDIENCE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Ontem e hoje no dia de America/Sao_Paulo: eventos que chegam depois da meia-noite (ou
 * atrasados no AE) ainda caem na rodada seguinte, e regravar o dia é seguro.
 */
export function defaultAudienceWindow(now: Date): DayWindow {
  const today = localDay.format(now);
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return { from: yesterday.toISOString().slice(0, 10), to: today };
}

/** Enfileira uma consolidação da janela padrão, para rodar já no worker. */
export async function enqueueAudienceAggregation(db: Executor): Promise<void> {
  await db.execute(sql`
    select graphile_worker.add_job(
      identifier => ${AGGREGATE_AUDIENCE_TASK},
      payload => '{}'::json,
      queue_name => ${AUDIENCE_QUEUE}
    )`);
}
