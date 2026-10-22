import { sql } from 'drizzle-orm';
import { Logger, runOnce } from 'graphile-worker';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import { builds } from '../../src/db/schema/index.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
import { INTERRUPTED_MESSAGE, recoverInterruptedBuilds } from '../../src/domain/builds/recover.ts';
import { createSite } from '../../src/domain/sites/sites.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

// Build-runner morto no meio da tentativa (#453): a trava do job e da fila build:<site> fica
// com um worker que não existe mais. A partida seguinte registra a tentativa e destrava.

let db: Db;
let close: () => Promise<void>;
let config: Parameters<typeof createSite>[2];

const DEAD = 'pool-morto';
const LOCKED_AT = new Date('2026-10-21T22:04:22Z');

beforeAll(async () => {
  ({ db, close } = await setupDatabase());
  const line = (await readFixture('exemplo-a')).find((l) => l.type === 'config');
  if (line?.type !== 'config') throw new Error('fixture sem config');
  config = line.data;
});
afterAll(() => close());
beforeEach(async () => {
  await resetDatabase(db);
  // O cadastro agenda o build:exemplo-a (mudança pendente).
  await db.transaction((tx) => createSite(tx, SYSTEM_ACTOR, config));
});

/** Trava o job e a fila como o Graphile Worker faz ao pegar o job, com o dono `owner`. */
async function lock(queue: string, owner: string): Promise<void> {
  await db.execute(sql`
    update graphile_worker._private_jobs set locked_by = ${owner}, locked_at = ${LOCKED_AT},
      attempts = attempts + 1
    where job_queue_id = (select id from graphile_worker._private_job_queues
                          where queue_name = ${queue})`);
  await db.execute(sql`
    update graphile_worker._private_job_queues set locked_by = ${owner}, locked_at = ${LOCKED_AT}
    where queue_name = ${queue}`);
}

async function locks(): Promise<{ queue_name: string; locked_by: string | null }[]> {
  const { rows } = await db.execute<{ queue_name: string; locked_by: string | null }>(sql`
    select q.queue_name, q.locked_by from graphile_worker._private_job_queues q
    union all
    select j.queue_name, j.locked_by from graphile_worker.jobs j
    order by 1, 2`);
  return rows;
}

describe('recuperação dos builds interrompidos', () => {
  it('libera a fila e o job de um worker morto e registra a tentativa como transitória', async () => {
    await lock('build:exemplo-a', DEAD);

    const recovered = await recoverInterruptedBuilds(db, 'local');

    const [job] = (await db.execute<{ id: string }>(sql`select id::text from graphile_worker.jobs`))
      .rows;
    expect(recovered).toEqual([
      { siteId: 'exemplo-a', jobId: job?.id, attempt: 1, lockedBy: DEAD },
    ]);
    expect(await locks()).toEqual([
      { queue_name: 'build:exemplo-a', locked_by: null },
      { queue_name: 'build:exemplo-a', locked_by: null },
    ]);
    expect(await db.select().from(builds)).toEqual([
      expect.objectContaining({
        siteId: 'exemplo-a',
        release: 'local',
        jobId: job?.id,
        attempt: 1,
        status: 'failed',
        failedStage: null,
        failureKind: 'transient',
        failureMessage: INTERRUPTED_MESSAGE,
        startedAt: LOCKED_AT,
      }),
    ]);
    // O site segue ativo: a falha é transitória e o job volta a rodar.
    const { rows } = await db.execute<{ state: string }>(
      sql`select state from sites where id = 'exemplo-a'`,
    );
    expect(rows).toEqual([{ state: 'ativo' }]);
  });

  it('o job preso na fila do worker morto roda depois da recuperação', async () => {
    await lock('build:exemplo-a', DEAD);
    await db.execute(sql`update graphile_worker._private_jobs set run_at = now()`);
    const ran: unknown[] = [];
    const runBuildOnce = () =>
      runOnce({
        pgPool: db.$client,
        logger: new Logger(() => () => {}),
        taskList: {
          build: (payload) => {
            ran.push(payload);
          },
        },
      });

    // Fila presa: o Graphile Worker não pega o job (só soltaria a trava depois de 4 h).
    await runBuildOnce();
    expect(ran).toEqual([]);

    await recoverInterruptedBuilds(db, 'local');
    await runBuildOnce();
    expect(ran).toEqual([expect.objectContaining({ siteId: 'exemplo-a' })]);
  });

  it('não toca a trava de um job de outra task', async () => {
    await db.execute(sql`
      select graphile_worker.add_job('ingest-media', '{}'::json, queue_name => 'media:exemplo-a')`);
    await lock('media:exemplo-a', 'worker-vivo');

    expect(await recoverInterruptedBuilds(db, 'local')).toEqual([]);
    expect(await locks()).toContainEqual({
      queue_name: 'media:exemplo-a',
      locked_by: 'worker-vivo',
    });
    expect(await db.select().from(builds)).toEqual([]);
  });

  it('sem travas, não grava nada', async () => {
    expect(await recoverInterruptedBuilds(db, 'local')).toEqual([]);
    expect(await db.select().from(builds)).toEqual([]);
  });
});
