import type { Task } from 'graphile-worker';

import { pingHeartbeat } from '../../lib/heartbeat.ts';

/** Sinal de vida do worker para o monitor externo (cron). Os jobs críticos pingam o próprio nome. */
export const heartbeat: Task = async (_payload, helpers) => {
  const sent = await pingHeartbeat(process.env.HEARTBEAT_BASE_URL, 'backoffice-worker');
  helpers.logger.debug(sent ? 'heartbeat enviado' : 'heartbeat desligado ou indisponível');
};
