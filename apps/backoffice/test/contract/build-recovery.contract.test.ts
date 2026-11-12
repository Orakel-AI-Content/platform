import { eq, sql } from 'drizzle-orm';
import { Logger, runOnce } from 'graphile-worker';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import { builds } from '../../src/db/schema/index.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
import {
  INTERRUPTED_MESSAGE,
  INTERRUPTED_ROLLBACK_MESSAGE,
  recoverInterruptedBuilds,
} from '../../src/domain/builds/recover.ts';
import { scheduleRollback } from '../../src/domain/builds/schedule.ts';
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

/**
 * A task pegou o job e promoveu a linha `na_fila` dele: o teste grava a linha `rodando` à mão,
 * então tira a da fila.
 */
async function promoted(): Promise<void> {
  await db.delete(builds).where(eq(builds.status, 'na_fila'));
}

/** Linha `na_fila` do cadastro: a do job que ainda não rodou nenhuma tentativa. */
const queuedRow = (): unknown =>
  expect.objectContaining({ siteId: 'exemplo-a', status: 'na_fila', requestedBy: 'system' });

/**
 * Trava o job (só os da task `task`, quando dada) e a fila como o Graphile Worker faz ao
 * pegar o job, com o dono `owner`.
 */
async function lock(queue: string, owner: string, task?: string): Promise<void> {
  await db.execute(sql`
    update graphile_worker._private_jobs set locked_by = ${owner}, locked_at = ${LOCKED_AT},
      attempts = attempts + 1
    where job_queue_id = (select id from graphile_worker._private_job_queues
                          where queue_name = ${queue})
      and (${task ?? null}::text is null
           or task_id = (select id from graphile_worker._private_tasks where identifier = ${task ?? null}))`);
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
  it('fecha a linha rodando da tentativa interrompida, sem inserir outra', async () => {
    await lock('build:exemplo-a', DEAD);
    await promoted();
    const [job] = (await db.execute<{ id: string }>(sql`select id::text from graphile_worker.jobs`))
      .rows;
    const startedAt = new Date('2026-10-21T22:04:23Z');
    const [open] = await db
      .insert(builds)
      .values({
        siteId: 'exemplo-a',
        release: '1.2.0',
        jobId: job?.id,
        attempt: 1,
        status: 'rodando',
        startedAt,
      })
      .returning({ id: builds.id });

    const recovered = await recoverInterruptedBuilds(db, 'local');

    expect(recovered).toEqual([
      { kind: 'build', siteId: 'exemplo-a', jobId: job?.id, attempt: 1, lockedBy: DEAD },
    ]);
    const rows = await db.select().from(builds);
    expect(rows).toEqual([
      expect.objectContaining({
        id: open?.id,
        kind: 'build',
        release: '1.2.0',
        jobId: job?.id,
        attempt: 1,
        status: 'failed',
        failedStage: null,
        failureKind: 'transient',
        failureMessage: INTERRUPTED_MESSAGE,
        startedAt,
      }),
    ]);
    expect(rows[0]?.finishedAt).toBeInstanceOf(Date);
  });

  it('não fecha a linha rodando de outra tentativa do mesmo job', async () => {
    await lock('build:exemplo-a', DEAD);
    await promoted();
    const [job] = (await db.execute<{ id: string }>(sql`select id::text from graphile_worker.jobs`))
      .rows;
    await db.insert(builds).values({
      siteId: 'exemplo-a',
      release: 'local',
      jobId: job?.id,
      attempt: 4,
      status: 'rodando',
      startedAt: LOCKED_AT,
    });

    await recoverInterruptedBuilds(db, 'local');

    expect(
      await db
        .select({ attempt: builds.attempt, status: builds.status })
        .from(builds)
        .orderBy(builds.attempt),
    ).toEqual([
      { attempt: 1, status: 'failed' },
      { attempt: 4, status: 'rodando' },
    ]);
  });

  it('sem linha rodando, libera a fila e o job e registra a tentativa como transitória', async () => {
    await lock('build:exemplo-a', DEAD);

    const recovered = await recoverInterruptedBuilds(db, 'local');

    const [job] = (await db.execute<{ id: string }>(sql`select id::text from graphile_worker.jobs`))
      .rows;
    expect(recovered).toEqual([
      { kind: 'build', siteId: 'exemplo-a', jobId: job?.id, attempt: 1, lockedBy: DEAD },
    ]);
    expect(await locks()).toEqual([
      { queue_name: 'build:exemplo-a', locked_by: null },
      { queue_name: 'build:exemplo-a', locked_by: null },
    ]);
    // A linha da fila continua: o job volta a rodar e a próxima tentativa a promove.
    expect(await db.select().from(builds).orderBy(builds.id)).toEqual([
      queuedRow(),
      expect.objectContaining({
        siteId: 'exemplo-a',
        release: 'local',
        kind: 'build',
        jobId: job?.id,
        attempt: 1,
        status: 'failed',
        failedStage: null,
        failureKind: 'transient',
        failureMessage: INTERRUPTED_MESSAGE,
        startedAt: LOCKED_AT,
        finishedAt: expect.any(Date) as Date,
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
    expect(await db.select().from(builds)).toEqual([queuedRow()]);
  });

  it('rollback interrompido: fecha a linha rodando dele como falha transitória', async () => {
    const versionId = '20261001T120000Z-abcdef12';
    await db.transaction((tx) => scheduleRollback(tx, 'exemplo-a', versionId, 'o@orakel.local'));
    await lock('build:exemplo-a', DEAD, 'rollback');
    const [job] = (
      await db.execute<{ id: string }>(
        sql`select id::text from graphile_worker.jobs where task_identifier = 'rollback'`,
      )
    ).rows;
    // A task promoveu a linha do pedido.
    await db
      .update(builds)
      .set({ status: 'rodando', release: 'local', startedAt: LOCKED_AT })
      .where(eq(builds.kind, 'rollback'));

    const recovered = await recoverInterruptedBuilds(db, 'local');

    expect(recovered).toEqual([
      { kind: 'rollback', siteId: 'exemplo-a', jobId: job?.id, attempt: 1, lockedBy: DEAD },
    ]);
    expect(await db.select().from(builds).where(eq(builds.kind, 'rollback'))).toEqual([
      expect.objectContaining({
        jobId: job?.id,
        attempt: 1,
        status: 'failed',
        failedStage: null,
        failureKind: 'transient',
        failureMessage: INTERRUPTED_ROLLBACK_MESSAGE,
        versionId,
        requestedBy: 'o@orakel.local',
        finishedAt: expect.any(Date) as Date,
      }),
    ]);
    // O build agendado do cadastro não estava travado: a linha dele continua na fila.
    expect(await db.select().from(builds).where(eq(builds.kind, 'build'))).toEqual([queuedRow()]);
    expect(await locks()).not.toContainEqual(expect.objectContaining({ locked_by: DEAD }));
  });

  it('rollback interrompido sem linha rodando: registra a tentativa com a versão de destino', async () => {
    const versionId = '20261001T120000Z-abcdef12';
    await db.transaction((tx) => scheduleRollback(tx, 'exemplo-a', versionId, 'o@orakel.local'));
    await lock('build:exemplo-a', DEAD, 'rollback');

    await recoverInterruptedBuilds(db, 'local');

    expect(
      await db.select().from(builds).where(eq(builds.kind, 'rollback')).orderBy(builds.id),
    ).toEqual([
      expect.objectContaining({ status: 'na_fila', versionId }),
      expect.objectContaining({
        status: 'failed',
        failureKind: 'transient',
        failureMessage: INTERRUPTED_ROLLBACK_MESSAGE,
        release: 'local',
        attempt: 1,
        versionId,
        startedAt: LOCKED_AT,
      }),
    ]);
  });

  it('sem travas, não grava nada', async () => {
    expect(await recoverInterruptedBuilds(db, 'local')).toEqual([]);
    expect(await db.select().from(builds)).toEqual([queuedRow()]);
  });
});
