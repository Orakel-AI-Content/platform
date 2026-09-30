import type { TaskList } from 'graphile-worker';

import { build } from './tasks/build.ts';
import { heartbeat } from './tasks/heartbeat.ts';

/** Jobs gerais do backoffice-worker. O agregador entra aqui, com o cron dele (ADR 0009 da raiz). */
export const WORKER_TASKS: TaskList = { heartbeat };

/** Cron embutido do Graphile Worker (formato crontab + nome da task). */
export const WORKER_CRONTAB = ['*/5 * * * * heartbeat'].join('\n');

/** O build-runner só executa builds, com concorrência 2. */
export const BUILD_RUNNER_TASKS: TaskList = { build };
export const BUILD_RUNNER_CONCURRENCY = 2;
