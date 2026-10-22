import { run } from 'graphile-worker';

import { getDb } from '../db/client.ts';
import type { BuildSettings } from '../domain/builds/plan.ts';
import { recoverInterruptedBuilds } from '../domain/builds/recover.ts';
import { getBuildRunnerEnv, getEnv, type BuildRunnerEnv, type Env } from '../env.ts';
import { BUILD_RUNNER_CONCURRENCY, buildRunnerTasks } from '../jobs/task-lists.ts';
import { dockerRuntime } from '../lib/docker.ts';
import { runProcess } from './run-process.ts';

function settingsFrom(env: Env, runner: BuildRunnerEnv): BuildSettings {
  return {
    image: runner.SITE_BUILDER_IMAGE,
    defaultTag: runner.SITE_BUILDER_TAG,
    exportNetwork: runner.BUILD_EXPORT_NETWORK,
    publishNetwork: runner.BUILD_PUBLISH_NETWORK,
    exportApiUrl: runner.BUILD_EXPORT_API_URL,
    exportBuildToken: env.EXPORT_BUILD_TOKEN,
    pageDropTolerance: runner.BUILD_PAGE_DROP_TOLERANCE,
    deploy:
      runner.DEPLOY_TARGET === 'local'
        ? { target: 'local', edgeLocalUrl: runner.EDGE_LOCAL_URL ?? '' }
        : {
            target: 'cloudflare',
            apiToken: runner.CLOUDFLARE_API_TOKEN ?? '',
            accountId: runner.CLOUDFLARE_ACCOUNT_ID ?? '',
          },
    s3: {
      endpoint: env.S3_ENDPOINT,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  };
}

// build-runner (12.0, L3): só a task `build`, no máximo dois builds simultâneos; a fila
// nomeada build:<site> garante um por vez por site. Cria os containers do site-builder pela
// API do Docker, sempre pelo docker-socket-proxy.
await runProcess('build-runner', async (logger) => {
  const runner = getBuildRunnerEnv();
  const { pool, db } = getDb();
  // Antes de pegar jobs: build de um runner que morreu no meio da tentativa vira falha
  // transitória e a fila build:<site> é liberada (o Graphile Worker só a solta depois de 4 h).
  for (const build of await recoverInterruptedBuilds(db, runner.SITE_BUILDER_TAG)) {
    logger.warn(build, `build de ${build.siteId} interrompido; fila liberada`);
  }
  const worker = await run({
    pgPool: pool,
    taskList: buildRunnerTasks({
      db,
      runtime: dockerRuntime({ host: runner.DOCKER_HOST }),
      settings: settingsFrom(getEnv(), runner),
    }),
    concurrency: BUILD_RUNNER_CONCURRENCY,
  });
  logger.info(
    { deployTarget: runner.DEPLOY_TARGET, image: runner.SITE_BUILDER_IMAGE },
    'build-runner no ar',
  );
  await worker.promise;
  await pool.end();
});
