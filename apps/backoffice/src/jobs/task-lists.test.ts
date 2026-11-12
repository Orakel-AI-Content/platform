import { parseCrontab } from 'graphile-worker';
import { describe, expect, it } from 'vitest';

import type { Db } from '../db/client.ts';
import type { BuildSettings } from '../domain/builds/plan.ts';
import type { ContainerRuntime } from '../domain/builds/runtime.ts';
import { resolveModel } from '../domain/generation/generate.ts';
import type { ObjectStore } from '../domain/media/store.ts';
import { RECONCILE_PREVIEW_TASK } from '../domain/preview/preview.ts';
import { CHECK_RELEASE_IMAGE_TASK, RELEASE_RUN_TASK } from '../domain/releases/releases.ts';
import { buildRunnerTasks, WORKER_CRONTAB, workerTasks } from './task-lists.ts';

describe('backoffice-worker', () => {
  it('o cron consolida a audiência a cada hora, na fila audience', () => {
    const item = parseCrontab(WORKER_CRONTAB).find((i) => i.task === 'aggregate-audience');

    expect(item).toBeDefined();
    expect(item?.options.queueName).toBe('audience');
    expect(item?.match).toBeTypeOf('function');
    expect(WORKER_CRONTAB.split('\n')).toContain('0 * * * * aggregate-audience ?queue=audience');
  });

  it('registra a task aggregate-audience, sem montar o cliente do AE na partida', () => {
    const tasks = workerTasks({
      db: {} as Db,
      store: {} as ObjectStore,
      generation: { model: resolveModel('fixture'), pricing: {} },
      api: { url: 'http://backoffice-web:3000', token: 'g'.repeat(32) },
      aeClient: () => {
        throw new Error('montado na partida');
      },
    });

    expect(tasks['aggregate-audience']).toBeTypeOf('function');
    expect(Object.keys(tasks)).toContain('heartbeat');
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
  });
});
