import { run } from 'graphile-worker';

import { getDb } from '../db/client.ts';
import { getEnv } from '../env.ts';
import { WORKER_CRONTAB, workerTasks } from '../jobs/task-lists.ts';
import { createS3Client, s3ObjectStore } from '../lib/s3.ts';
import { runProcess } from './run-process.ts';

// backoffice-worker: jobs gerais (ingestão de mídia) e agregador (cron). Encerra com SIGTERM/SIGINT.
await runProcess('backoffice-worker', async (logger) => {
  const { pool, db } = getDb();
  const runner = await run({
    pgPool: pool,
    taskList: workerTasks({ db, store: s3ObjectStore(createS3Client(getEnv())) }),
    crontab: WORKER_CRONTAB,
    concurrency: 4,
  });
  logger.info('backoffice-worker no ar');
  await runner.promise;
  await pool.end();
});
