import { parseCrontab } from 'graphile-worker';
import { describe, expect, it } from 'vitest';

import type { Db } from '../db/client.ts';
import type { BuildSettings } from '../domain/builds/plan.ts';
import type { ContainerRuntime } from '../domain/builds/runtime.ts';
import { CHECK_SITE_INFRA_TASK } from '../domain/builds/site-state.ts';
import { resolveModel } from '../domain/generation/generate.ts';
import type { ObjectStore } from '../domain/media/store.ts';
import { RECONCILE_PREVIEW_TASK } from '../domain/preview/preview.ts';
import { CHECK_RELEASE_IMAGE_TASK, RELEASE_RUN_TASK } from '../domain/releases/releases.ts';
import { LINK_CHECK_TASK } from '../domain/reviews/link-checks.ts';
import { REVIEW_OPINION_TASK } from '../domain/reviews/opinions.ts';
import type { ZoneChecker } from '../lib/cloudflare.ts';
import { buildRunnerTasks, WORKER_CRONTAB, workerTasks } from './task-lists.ts';

describe('backoffice-worker', () => {
  it('o cron consolida a audiência a cada hora, na fila audience', () => {
    const item = parseCrontab(WORKER_CRONTAB).find((i) => i.task === 'aggregate-audience');

    expect(item).toBeDefined();
    expect(item?.options.queueName).toBe('audience');
    expect(item?.match).toBeTypeOf('function');
    expect(WORKER_CRONTAB.split('\n')).toContain('0 * * * * aggregate-audience ?queue=audience');
  });

  it('o cron confere a infra dos sites a cada 5 minutos, numa tentativa só', () => {
    const item = parseCrontab(WORKER_CRONTAB).find((i) => i.task === CHECK_SITE_INFRA_TASK);

    expect(item).toBeDefined();
    expect(item?.options.maxAttempts).toBe(1);
    expect(WORKER_CRONTAB.split('\n')).toContain('*/5 * * * * check-site-infra ?max=1');
  });

  it('registra a task aggregate-audience, sem montar o cliente do AE na partida', () => {
    const tasks = workerTasks({
      db: {} as Db,
      store: {} as ObjectStore,
      generation: { model: resolveModel('fixture'), pricing: {} },
      api: { url: 'http://backoffice-web:3000', token: 'g'.repeat(32) },
      zones: {} as ZoneChecker,
      aeClient: () => {
        throw new Error('montado na partida');
      },
    });

    expect(tasks['aggregate-audience']).toBeTypeOf('function');
    expect(Object.keys(tasks)).toContain('heartbeat');
    expect(tasks[CHECK_SITE_INFRA_TASK]).toBeTypeOf('function');
  });

  it('registra a checagem de links externos no worker, que tem saída para a internet', () => {
    const tasks = workerTasks({
      db: {} as Db,
      store: {} as ObjectStore,
      generation: { model: resolveModel('fixture'), pricing: {} },
      api: { url: 'http://backoffice-web:3000', token: 'g'.repeat(32) },
      zones: {} as ZoneChecker,
    });

    expect(LINK_CHECK_TASK).toBe('check-content-links');
    expect(tasks[LINK_CHECK_TASK]).toBeTypeOf('function');
  });

  it('registra o parecer automático da revisão no worker, que tem o modelo da geração', () => {
    const tasks = workerTasks({
      db: {} as Db,
      store: {} as ObjectStore,
      generation: { model: resolveModel('fixture'), pricing: {} },
      api: { url: 'http://backoffice-web:3000', token: 'g'.repeat(32) },
      zones: {} as ZoneChecker,
    });

    expect(REVIEW_OPINION_TASK).toBe('review-opinion');
    expect(tasks[REVIEW_OPINION_TASK]).toBeTypeOf('function');
  });
});

describe('build-runner', () => {
  it('só o build-runner registra a conferência da imagem, a troca da prévia e o run das releases (Docker e GitHub)', () => {
    const runner = buildRunnerTasks({
      db: {} as Db,
      runtime: {} as ContainerRuntime,
      settings: {} as BuildSettings,
      driver: { kind: 'local' },
      preview: { internalNetwork: 'orakel-internal', exportPreviewToken: 'p'.repeat(32) },
    });
    const worker = workerTasks({
      db: {} as Db,
      store: {} as ObjectStore,
      generation: { model: resolveModel('fixture'), pricing: {} },
      api: { url: 'http://backoffice-web:3000', token: 'g'.repeat(32) },
      zones: {} as ZoneChecker,
    });

    expect(Object.keys(runner).sort()).toEqual(
      [
        'build',
        CHECK_RELEASE_IMAGE_TASK,
        RECONCILE_PREVIEW_TASK,
        RELEASE_RUN_TASK,
        'rollback',
      ].sort(),
    );
    expect(Object.keys(worker)).not.toContain(CHECK_RELEASE_IMAGE_TASK);
    expect(Object.keys(worker)).not.toContain(RELEASE_RUN_TASK);
    expect(Object.keys(worker)).not.toContain(RECONCILE_PREVIEW_TASK);
    expect(Object.keys(runner)).not.toContain(LINK_CHECK_TASK);
  });
});
