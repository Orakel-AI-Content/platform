import { run } from 'graphile-worker';

import { getDb } from '../db/client.ts';
import { resolveModel } from '../domain/generation/generate.ts';
import { getEnv, getZoneCheckEnv } from '../env.ts';
import { WORKER_CRONTAB, workerTasks } from '../jobs/task-lists.ts';
import { zoneCheckerFrom } from '../lib/cloudflare.ts';
import { createS3Client, s3ObjectStore } from '../lib/s3.ts';
import { runProcess } from './run-process.ts';

// backoffice-worker: jobs gerais (mídia, publicação agendada, geração) e, pelo cron, agregador da
// audiência e conferência da infra dos sites. Encerra com SIGTERM/SIGINT.
await runProcess('backoffice-worker', async (logger) => {
  const { pool, db } = getDb();
  const env = getEnv();
  const runner = await run({
    pgPool: pool,
    taskList: workerTasks({
      db,
      store: s3ObjectStore(createS3Client(env)),
      generation: {
        model: resolveModel(env.LLM_MODEL, env.LLM_API_KEY),
        pricing: env.LLM_PRICING,
      },
      api: { url: env.GENERATOR_API_URL, token: env.GENERATOR_TOKEN },
      zones: zoneCheckerFrom(getZoneCheckEnv()),
    }),
    crontab: WORKER_CRONTAB,
    concurrency: 4,
  });
  logger.info('backoffice-worker no ar');
  await runner.promise;
  await pool.end();
});
