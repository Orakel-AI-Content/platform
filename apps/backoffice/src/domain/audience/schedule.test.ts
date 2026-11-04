import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import type { Executor } from '../../db/client.ts';
import {
  AGGREGATE_AUDIENCE_TASK,
  AUDIENCE_QUEUE,
  defaultAudienceWindow,
  enqueueAudienceAggregation,
} from './schedule.ts';

describe('defaultAudienceWindow', () => {
  it('ontem e hoje no dia de São Paulo', () => {
    expect(defaultAudienceWindow(new Date('2026-11-04T15:00:00Z'))).toEqual({
      from: '2026-11-03',
      to: '2026-11-04',
    });
  });

  it('virada de mês e de ano', () => {
    expect(defaultAudienceWindow(new Date('2026-03-01T12:00:00Z'))).toEqual({
      from: '2026-02-28',
      to: '2026-03-01',
    });
    expect(defaultAudienceWindow(new Date('2027-01-01T12:00:00Z'))).toEqual({
      from: '2026-12-31',
      to: '2027-01-01',
    });
  });
});

describe('enqueueAudienceAggregation', () => {
  it('enfileira na fila audience, sem job_key', async () => {
    const execute = vi.fn<(query: SQL) => Promise<unknown>>(() => Promise.resolve());
    await enqueueAudienceAggregation({ execute } as unknown as Executor);

    const query = new PgDialect().sqlToQuery(execute.mock.calls[0]?.[0] as SQL);
    expect(query.sql).toContain('graphile_worker.add_job');
    expect(query.sql).toContain('queue_name =>');
    expect(query.sql).not.toContain('job_key');
    expect(query.params).toEqual([AGGREGATE_AUDIENCE_TASK, AUDIENCE_QUEUE]);
  });
});
