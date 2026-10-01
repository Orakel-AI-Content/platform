import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import { buildNow, scheduleBuild } from '../../src/domain/builds/schedule.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await setupDatabase());
});
afterAll(() => close());
beforeEach(() => resetDatabase(db));

type JobRow = { task_identifier: string; queue_name: string; key: string; run_at: string };

async function buildJobs(): Promise<JobRow[]> {
  const result = await db.execute(
    sql`select task_identifier, queue_name, key, run_at from graphile_worker.jobs`,
  );
  return result.rows as JobRow[];
}

describe('agendamento de build (Graphile Worker)', () => {
  const t0 = new Date('2026-09-29T12:00:00Z');

  it('publicações dentro da janela caem no mesmo job e mantêm o primeiro horário', async () => {
    await db.transaction((tx) => scheduleBuild(tx, 'exemplo-a', { windowMs: 60_000, now: t0 }));
    await db.transaction((tx) =>
      scheduleBuild(tx, 'exemplo-a', { windowMs: 60_000, now: new Date(t0.getTime() + 30_000) }),
    );
    const jobs = await buildJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      task_identifier: 'build',
      queue_name: 'build:exemplo-a',
      key: 'build:exemplo-a',
    });
    expect(new Date(jobs[0]?.run_at ?? '').toISOString()).toBe('2026-09-29T12:01:00.000Z');
  });

  it('um job por site, e "publicar agora" antecipa o horário', async () => {
    await db.transaction((tx) => scheduleBuild(tx, 'exemplo-a', { windowMs: 60_000, now: t0 }));
    await db.transaction((tx) => scheduleBuild(tx, 'exemplo-b', { windowMs: 60_000, now: t0 }));
    await db.transaction((tx) => buildNow(tx, 'exemplo-a', t0));
    const jobs = await buildJobs();
    expect(jobs.map((job) => job.key).sort()).toEqual(['build:exemplo-a', 'build:exemplo-b']);
    expect(
      new Date(jobs.find((job) => job.key === 'build:exemplo-a')?.run_at ?? '').toISOString(),
    ).toBe(t0.toISOString());
  });

  it('o job entra ou sai junto com a transação da gravação', async () => {
    await db
      .transaction(async (tx) => {
        await scheduleBuild(tx, 'exemplo-a', { now: t0 });
        throw new Error('desfaz');
      })
      .catch(() => undefined);
    expect(await buildJobs()).toHaveLength(0);
  });
});
