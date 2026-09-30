import { run } from 'graphile-worker';

import { getDb } from '../db/client.ts';
import { WORKER_CRONTAB, WORKER_TASKS } from '../jobs/task-lists.ts';
import { runProcess } from './run-process.ts';

// backoffice-worker: jobs gerais e agregador (cron). Encerra com SIGTERM/SIGINT.
await runProcess('backoffice-worker', async (logger) => {
  const { pool } = getDb();
  const runner = await run({
    pgPool: pool,
    taskList: WORKER_TASKS,
    crontab: WORKER_CRONTAB,
    concurrency: 4,
  });
  logger.info('backoffice-worker no ar');
  await runner.promise;
  await pool.end();
});
