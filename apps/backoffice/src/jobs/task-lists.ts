import type { TaskList } from 'graphile-worker';

import { AGGREGATE_AUDIENCE_TASK, AUDIENCE_QUEUE } from '../domain/audience/schedule.ts';
import { CORRECT_ARTICLE_TASK, GENERATE_ARTICLE_TASK } from '../domain/generation/runs.ts';
import { REPROCESS_TASK } from '../domain/media/reprocess.ts';
import { RESTORE_MEDIA_TASK } from '../domain/media/schedule.ts';
import { INGEST_TASK } from '../domain/media/upload.ts';
import { EMPTY_SITE_MEDIA_TASK, VARIANTS_TASK } from '../domain/media/variants.ts';
import { ROLLBACK_TASK } from '../domain/builds/schedule.ts';
import { CHECK_SITE_INFRA_TASK } from '../domain/builds/site-state.ts';
import { PUBLISH_SCHEDULED_TASK } from '../domain/publications/schedule.ts';
import { RECONCILE_PREVIEW_TASK } from '../domain/preview/preview.ts';
import { LINK_CHECK_TASK } from '../domain/reviews/link-checks.ts';
import { REVIEW_OPINION_TASK } from '../domain/reviews/opinions.ts';
import { CHECK_RELEASE_IMAGE_TASK, RELEASE_RUN_TASK } from '../domain/releases/releases.ts';
import { INFRA_APPLY_TASK, INFRA_PLAN_TASK } from '../domain/infra/schedule.ts';
import {
  createAggregateAudienceTask,
  type AggregateAudienceTaskDeps,
} from './tasks/aggregate-audience.ts';
import { createBuildTask, type BuildTaskDeps } from './tasks/build.ts';
import { createCheckContentLinksTask } from './tasks/check-content-links.ts';
import { createCheckReleaseImageTask } from './tasks/check-release-image.ts';
import { createCheckSiteInfraTask, type CheckSiteInfraTaskDeps } from './tasks/check-site-infra.ts';
import { createCorrectArticleTask } from './tasks/correct-article.ts';
import {
  createGenerateArticleTask,
  type GenerateArticleTaskDeps,
} from './tasks/generate-article.ts';
import { createEmptySiteMediaTask } from './tasks/empty-site-media.ts';
import { heartbeat } from './tasks/heartbeat.ts';
import { createInfraApplyTask } from './tasks/infra-apply.ts';
import { createInfraPlanTask } from './tasks/infra-plan.ts';
import type { InfraTaskDeps } from './tasks/infra-run.ts';
import { createIngestMediaTask } from './tasks/ingest-media.ts';
import { createMediaReprocessTask } from './tasks/media-reprocess.ts';
import { createMediaVariantsTask, type MediaVariantsTaskDeps } from './tasks/media-variants.ts';
import { createPublishScheduledTask } from './tasks/publish-scheduled.ts';
import {
  createReconcilePreviewTask,
  type ReconcilePreviewTaskDeps,
} from './tasks/reconcile-preview.ts';
import { createRestoreSiteMediaTask } from './tasks/restore-site-media.ts';
import { createReleaseRunTask, type ReleaseRunTaskDeps } from './tasks/release-run.ts';
import { createReviewOpinionTask } from './tasks/review-opinion.ts';
import { createRollbackTask } from './tasks/rollback.ts';

export type WorkerTaskDeps = MediaVariantsTaskDeps &
  Pick<GenerateArticleTaskDeps, 'generation' | 'api'> &
  Pick<CheckSiteInfraTaskDeps, 'zones'> &
  Partial<Omit<AggregateAudienceTaskDeps, 'db'>>;

/** Jobs gerais do backoffice-worker. O agregador entra aqui, com o cron dele (ADR 0009 da raiz). */
export function workerTasks(deps: WorkerTaskDeps): TaskList {
  return {
    heartbeat,
    [INGEST_TASK]: createIngestMediaTask(deps),
    [VARIANTS_TASK]: createMediaVariantsTask(deps),
    [REPROCESS_TASK]: createMediaReprocessTask(deps),
    [EMPTY_SITE_MEDIA_TASK]: createEmptySiteMediaTask(deps),
    [RESTORE_MEDIA_TASK]: createRestoreSiteMediaTask(deps),
    [PUBLISH_SCHEDULED_TASK]: createPublishScheduledTask(deps),
    [GENERATE_ARTICLE_TASK]: createGenerateArticleTask(deps),
    [CORRECT_ARTICLE_TASK]: createCorrectArticleTask(deps),
    [AGGREGATE_AUDIENCE_TASK]: createAggregateAudienceTask(deps),
    [CHECK_SITE_INFRA_TASK]: createCheckSiteInfraTask(deps),
    [LINK_CHECK_TASK]: createCheckContentLinksTask(deps),
    [REVIEW_OPINION_TASK]: createReviewOpinionTask(deps),
  };
}

/**
 * Cron embutido do Graphile Worker (formato crontab + nome da task). A consolidação da
 * audiência roda de hora em hora na fila `audience`, a mesma do comando da operação. A
 * conferência da infra roda a cada 5 minutos, numa tentativa só: a próxima é o próprio cron.
 */
export const WORKER_CRONTAB = [
  '*/5 * * * * heartbeat',
  `0 * * * * ${AGGREGATE_AUDIENCE_TASK} ?queue=${AUDIENCE_QUEUE}`,
  `*/5 * * * * ${CHECK_SITE_INFRA_TASK} ?max=1`,
].join('\n');

/**
 * O build-runner executa builds e rollbacks (fila `build:<site>`), a conferência da imagem
 * das releases e a troca do container da prévia (fila `preview`, ADR 0024 da raiz), os únicos
 * jobs que falam com o Docker, e o run do release.yml, o único que usa a credencial do GitHub
 * (ADR 0022 da raiz), e o plano e o apply da infra do site (fila `infra:<site>`, ADR 0027 da
 * raiz), os únicos que recebem os segredos de infra; concorrência 2.
 */
export function buildRunnerTasks(
  deps: BuildTaskDeps &
    Pick<ReleaseRunTaskDeps, 'driver'> &
    Pick<ReconcilePreviewTaskDeps, 'preview'> &
    Pick<InfraTaskDeps, 'infra'>,
): TaskList {
  return {
    build: createBuildTask(deps),
    [ROLLBACK_TASK]: createRollbackTask(deps),
    [CHECK_RELEASE_IMAGE_TASK]: createCheckReleaseImageTask(deps),
    [RELEASE_RUN_TASK]: createReleaseRunTask(deps),
    [RECONCILE_PREVIEW_TASK]: createReconcilePreviewTask(deps),
    [INFRA_PLAN_TASK]: createInfraPlanTask(deps),
    [INFRA_APPLY_TASK]: createInfraApplyTask(deps),
  };
}
export const BUILD_RUNNER_CONCURRENCY = 2;
