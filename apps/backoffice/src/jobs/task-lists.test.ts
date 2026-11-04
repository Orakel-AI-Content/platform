import { parseCrontab } from 'graphile-worker';
import { describe, expect, it } from 'vitest';

import type { Db } from '../db/client.ts';
import { resolveModel } from '../domain/generation/generate.ts';
import type { ObjectStore } from '../domain/media/store.ts';
import { WORKER_CRONTAB, workerTasks } from './task-lists.ts';

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
