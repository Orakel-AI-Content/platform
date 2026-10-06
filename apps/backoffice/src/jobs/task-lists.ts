import type { TaskList } from 'graphile-worker';

import { INGEST_TASK } from '../domain/media/upload.ts';
import { createBuildTask, type BuildTaskDeps } from './tasks/build.ts';
import { heartbeat } from './tasks/heartbeat.ts';
import { createIngestMediaTask, type IngestMediaTaskDeps } from './tasks/ingest-media.ts';

/** Jobs gerais do backoffice-worker. O agregador entra aqui, com o cron dele (ADR 0009 da raiz). */
export function workerTasks(deps: IngestMediaTaskDeps): TaskList {
  return { heartbeat, [INGEST_TASK]: createIngestMediaTask(deps) };
}

/** Cron embutido do Graphile Worker (formato crontab + nome da task). */
export const WORKER_CRONTAB = ['*/5 * * * * heartbeat'].join('\n');

/** O build-runner só executa builds, com concorrência 2. */
export function buildRunnerTasks(deps: BuildTaskDeps): TaskList {
  return { build: createBuildTask(deps) };
}
export const BUILD_RUNNER_CONCURRENCY = 2;
