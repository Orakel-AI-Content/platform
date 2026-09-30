import { run } from 'graphile-worker';

import { getDb } from '../db/client.ts';
import { BUILD_RUNNER_CONCURRENCY, BUILD_RUNNER_TASKS } from '../jobs/task-lists.ts';
import { runProcess } from './run-process.ts';

// build-runner: só a task `build`, no máximo dois builds simultâneos; a fila nomeada
// build:<site> garante um por vez por site. Entra no compose com o build-site.
await runProcess('build-runner', async (logger) => {
  const { pool } = getDb();
  const runner = await run({
    pgPool: pool,
    taskList: BUILD_RUNNER_TASKS,
    concurrency: BUILD_RUNNER_CONCURRENCY,
  });
  logger.info('build-runner no ar');
  await runner.promise;
  await pool.end();
});
