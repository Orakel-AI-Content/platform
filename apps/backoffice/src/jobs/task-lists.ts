import type { TaskList } from 'graphile-worker';

import { REPROCESS_TASK } from '../domain/media/reprocess.ts';
import { INGEST_TASK } from '../domain/media/upload.ts';
import { VARIANTS_TASK } from '../domain/media/variants.ts';
import { PUBLISH_SCHEDULED_TASK } from '../domain/publications/schedule.ts';
import { createBuildTask, type BuildTaskDeps } from './tasks/build.ts';
import { heartbeat } from './tasks/heartbeat.ts';
import { createIngestMediaTask } from './tasks/ingest-media.ts';
import { createMediaReprocessTask } from './tasks/media-reprocess.ts';
import { createMediaVariantsTask, type MediaVariantsTaskDeps } from './tasks/media-variants.ts';
import { createPublishScheduledTask } from './tasks/publish-scheduled.ts';

/** Jobs gerais do backoffice-worker. O agregador entra aqui, com o cron dele (ADR 0009 da raiz). */
export function workerTasks(deps: MediaVariantsTaskDeps): TaskList {
  return {
    heartbeat,
    [INGEST_TASK]: createIngestMediaTask(deps),
    [VARIANTS_TASK]: createMediaVariantsTask(deps),
    [REPROCESS_TASK]: createMediaReprocessTask(deps),
    [PUBLISH_SCHEDULED_TASK]: createPublishScheduledTask(deps),
  };
}

/** Cron embutido do Graphile Worker (formato crontab + nome da task). */
export const WORKER_CRONTAB = ['*/5 * * * * heartbeat'].join('\n');

/** O build-runner só executa builds, com concorrência 2. */
export function buildRunnerTasks(deps: BuildTaskDeps): TaskList {
  return { build: createBuildTask(deps) };
}
export const BUILD_RUNNER_CONCURRENCY = 2;
