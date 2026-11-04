import type { TaskList } from 'graphile-worker';

import { GENERATE_ARTICLE_TASK } from '../domain/generation/runs.ts';
import { REPROCESS_TASK } from '../domain/media/reprocess.ts';
import { INGEST_TASK } from '../domain/media/upload.ts';
import { VARIANTS_TASK } from '../domain/media/variants.ts';
import { ROLLBACK_TASK } from '../domain/builds/schedule.ts';
import { PUBLISH_SCHEDULED_TASK } from '../domain/publications/schedule.ts';
import { createBuildTask, type BuildTaskDeps } from './tasks/build.ts';
import {
  createGenerateArticleTask,
  type GenerateArticleTaskDeps,
} from './tasks/generate-article.ts';
import { heartbeat } from './tasks/heartbeat.ts';
import { createIngestMediaTask } from './tasks/ingest-media.ts';
import { createMediaReprocessTask } from './tasks/media-reprocess.ts';
import { createMediaVariantsTask, type MediaVariantsTaskDeps } from './tasks/media-variants.ts';
import { createPublishScheduledTask } from './tasks/publish-scheduled.ts';
import { createRollbackTask } from './tasks/rollback.ts';

export type WorkerTaskDeps = MediaVariantsTaskDeps &
  Pick<GenerateArticleTaskDeps, 'generation' | 'api'>;

/** Jobs gerais do backoffice-worker. O agregador entra aqui, com o cron dele (ADR 0009 da raiz). */
export function workerTasks(deps: WorkerTaskDeps): TaskList {
  return {
    heartbeat,
    [INGEST_TASK]: createIngestMediaTask(deps),
    [VARIANTS_TASK]: createMediaVariantsTask(deps),
    [REPROCESS_TASK]: createMediaReprocessTask(deps),
    [PUBLISH_SCHEDULED_TASK]: createPublishScheduledTask(deps),
    [GENERATE_ARTICLE_TASK]: createGenerateArticleTask(deps),
  };
}

/** Cron embutido do Graphile Worker (formato crontab + nome da task). */
export const WORKER_CRONTAB = ['*/5 * * * * heartbeat'].join('\n');

/** O build-runner só executa builds e rollbacks (fila `build:<site>`), com concorrência 2. */
export function buildRunnerTasks(deps: BuildTaskDeps): TaskList {
  return { build: createBuildTask(deps), [ROLLBACK_TASK]: createRollbackTask(deps) };
}
export const BUILD_RUNNER_CONCURRENCY = 2;
