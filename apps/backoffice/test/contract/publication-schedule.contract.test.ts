import { and, asc, eq, sql } from 'drizzle-orm';
import { Logger, runOnce } from 'graphile-worker';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import { contentVersions, publications, sites } from '../../src/db/schema/index.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { SYSTEM_ACTOR, type Actor } from '../../src/domain/access/rbac.ts';
import { submitForReview, updateContent } from '../../src/domain/content/contents.ts';
import { importSnapshot } from '../../src/domain/import/import-snapshot.ts';
import {
  configureDailyPublishLimit,
  publishVersion,
} from '../../src/domain/publications/publish.ts';
import {
  cancelScheduledPublication,
  PUBLISH_SCHEDULED_TASK,
  publishJobKey,
  schedulePublication,
} from '../../src/domain/publications/schedule.ts';
import { approveVersion, REVIEW_CHECKLIST } from '../../src/domain/reviews/reviews.ts';
import { unresolvedPendingChangeIds } from '../../src/domain/sites/sites.ts';
import { createPublishScheduledTask } from '../../src/jobs/tasks/publish-scheduled.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

// Agendamento da publicação com job no backoffice-worker (#488, workspace#20 R3).

let db: Db;
let close: () => Promise<void>;

const SITE = 'exemplo-a';
const ALL = REVIEW_CHECKLIST.map((item) => item.key);
const role = (name: 'editor' | 'revisor'): Actor => ({
  email: `${name}@orakel.local`,
  roles: [name],
});
/** "Agora" dos testes: o horário marcado é sempre posterior. */
const NOW = new Date('2026-11-04T08:00:00-03:00');
const DAY = '2026-11-05';

beforeAll(async () => {
  ({ db, close } = await setupDatabase());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDatabase(db);
  const imported = await importSnapshot(db, SYSTEM_ACTOR, await readFixture(SITE));
  if (!imported.ok) throw new Error(JSON.stringify(imported.issues));
});
afterEach(() => {
  configureDailyPublishLimit(3);
});

async function versions(contentId: number) {
  return db
    .select()
    .from(contentVersions)
    .where(and(eq(contentVersions.siteId, SITE), eq(contentVersions.contentId, contentId)))
    .orderBy(asc(contentVersions.version));
}

const statusOf = async (contentId: number, version: number) =>
  (await versions(contentId)).find((row) => row.version === version)?.status;

/** Nova versão enviada para revisão e, se pedido, aprovada. */
async function prepare(contentId: number, approve = true): Promise<number> {
  const last = (await versions(contentId)).at(-1);
  if (last === undefined) throw new Error(`conteúdo ${contentId} sem versão`);
  const saved = await db.transaction((tx) =>
    updateContent(tx, SYSTEM_ACTOR, SITE, contentId, last.data),
  );
  if (!saved.ok) throw new Error(JSON.stringify(saved.issues));
  await db.transaction((tx) => submitForReview(tx, SYSTEM_ACTOR, SITE, contentId));
  if (approve) {
    const approved = await db.transaction((tx) =>
      approveVersion(tx, role('revisor'), SITE, contentId, saved.value.version, ALL),
    );
    if (!approved.ok) throw new Error(JSON.stringify(approved.issues));
  }
  return saved.value.version;
}

const schedule = (contentId: number, version: number, at: string, actor = role('revisor')) =>
  db.transaction((tx) =>
    schedulePublication(tx, actor, SITE, contentId, version, new Date(at), { now: NOW }),
  );

const cancel = (contentId: number, version: number, actor = role('revisor')) =>
  db.transaction((tx) => cancelScheduledPublication(tx, actor, SITE, contentId, version));

async function jobs(task: string) {
  const { rows } = await db.execute<{ key: string | null; run_at: Date; payload: unknown }>(sql`
    select j.key, j.run_at, j.payload from graphile_worker._private_jobs j
    join graphile_worker._private_tasks t on t.id = j.task_id
    where t.identifier = ${task}`);
  return rows;
}

/** O horário chega: o job vence agora e o worker roda uma vez, com a task de verdade. */
async function runDueJobs() {
  await db.execute(sql`update graphile_worker._private_jobs set run_at = now()`);
  await runOnce({
    pgPool: db.$client,
    logger: new Logger(() => () => {}),
    taskList: { [PUBLISH_SCHEDULED_TASK]: createPublishScheduledTask({ db }) },
  });
}

const setSiteLimit = (limit: number | null) =>
  db.update(sites).set({ dailyPublishLimit: limit }).where(eq(sites.id, SITE));

describe('agendar', () => {
  it('leva a versão a agendado, reserva em publications e enfileira o job no horário', async () => {
    const version = await prepare(1);
    const pending = await unresolvedPendingChangeIds(db, SITE);
    await db.execute(sql`delete from graphile_worker._private_jobs`);
    const at = `${DAY}T10:00:00-03:00`;

    const result = await schedule(1, version, at);

    expect(result).toMatchObject({ ok: true });
    expect(await statusOf(1, version)).toBe('agendado');
    const rows = await db.select().from(publications);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      siteId: SITE,
      contentId: 1,
      version,
      publishedBy: 'revisor@orakel.local',
      publishedAt: new Date(at),
      scheduledFor: new Date(at),
    });
    const queued = await jobs(PUBLISH_SCHEDULED_TASK);
    expect(queued).toHaveLength(1);
    expect(queued[0]?.key).toBe(publishJobKey(SITE, 1));
    expect(new Date(queued[0]?.run_at ?? 0)).toEqual(new Date(at));
    expect(queued[0]?.payload).toEqual({ siteId: SITE, contentId: 1, version });
    expect(await unresolvedPendingChangeIds(db, SITE)).toEqual(pending);
    expect(await jobs('build')).toEqual([]);
  });

  it('o job no horário publica a versão e registra a mudança pendente com o build', async () => {
    const version = await prepare(1);
    expect(await schedule(1, version, `${DAY}T10:00:00-03:00`)).toMatchObject({ ok: true });
    const pending = await unresolvedPendingChangeIds(db, SITE);
    await db.execute(sql`select graphile_worker.remove_job(${`build:${SITE}`})`);

    await runDueJobs();

    expect(await statusOf(1, version)).toBe('publicado');
    expect((await unresolvedPendingChangeIds(db, SITE)).length).toBe(pending.length + 1);
    expect((await jobs('build')).map((job) => job.key)).toEqual([`build:${SITE}`]);
    expect(await jobs(PUBLISH_SCHEDULED_TASK)).toEqual([]);
    expect(await db.select().from(publications)).toHaveLength(1);
  });

  it('o job de uma versão que saiu de agendado não muda nada', async () => {
    const version = await prepare(1);
    expect(await schedule(1, version, `${DAY}T10:00:00-03:00`)).toMatchObject({ ok: true });
    // Cancelamento que não chegou a remover o job (a corrida com o worker).
    await db
      .update(contentVersions)
      .set({ status: 'aprovado' })
      .where(and(eq(contentVersions.contentId, 1), eq(contentVersions.version, version)));
    const pending = await unresolvedPendingChangeIds(db, SITE);
    await db.execute(sql`select graphile_worker.remove_job(${`build:${SITE}`})`);

    await runDueJobs();

    expect(await statusOf(1, version)).toBe('aprovado');
    expect(await unresolvedPendingChangeIds(db, SITE)).toEqual(pending);
    expect(await jobs('build')).toEqual([]);
  });
});

describe('limite diário por reserva', () => {
  it('com 3 publicadas ou agendadas no dia marcado, recusa outra nesse dia e aceita no seguinte', async () => {
    await setSiteLimit(3);
    const v1 = await prepare(1);
    const published = await db.transaction((tx) =>
      publishVersion(tx, role('revisor'), SITE, 1, v1, { now: new Date(`${DAY}T09:00:00-03:00`) }),
    );
    expect(published).toMatchObject({ ok: true });
    expect(await schedule(2, await prepare(2), `${DAY}T12:00:00-03:00`)).toMatchObject({
      ok: true,
    });
    // 23:30 de São Paulo já é o dia seguinte em UTC, e ainda conta no dia marcado.
    expect(await schedule(3, await prepare(3), `${DAY}T23:30:00-03:00`)).toMatchObject({
      ok: true,
    });

    const version = await prepare(1);
    expect(await schedule(1, version, `${DAY}T23:59:00-03:00`)).toMatchObject({
      ok: false,
      issues: [{ code: 'publication.daily_limit' }],
    });
    expect(await statusOf(1, version)).toBe('aprovado');
    expect(await schedule(1, version, '2026-11-06T00:30:00-03:00')).toMatchObject({ ok: true });
  });

  it('a publicação imediata conta as agendadas do dia', async () => {
    await setSiteLimit(1);
    expect(await schedule(1, await prepare(1), `${DAY}T18:00:00-03:00`)).toMatchObject({
      ok: true,
    });
    const v2 = await prepare(2);
    const result = await db.transaction((tx) =>
      publishVersion(tx, role('revisor'), SITE, 2, v2, { now: new Date(`${DAY}T09:00:00-03:00`) }),
    );
    expect(result).toMatchObject({ ok: false, issues: [{ code: 'publication.daily_limit' }] });
  });
});

describe('cancelar', () => {
  it('volta a versão a aprovado, remove o job e libera a vaga do dia', async () => {
    await setSiteLimit(1);
    const version = await prepare(1);
    expect(await schedule(1, version, `${DAY}T10:00:00-03:00`)).toMatchObject({ ok: true });
    const v2 = await prepare(2);
    expect(await schedule(2, v2, `${DAY}T11:00:00-03:00`)).toMatchObject({
      ok: false,
      issues: [{ code: 'publication.daily_limit' }],
    });

    expect(await cancel(1, version)).toMatchObject({ ok: true });

    expect(await statusOf(1, version)).toBe('aprovado');
    expect(await jobs(PUBLISH_SCHEDULED_TASK)).toEqual([]);
    expect(await db.select().from(publications)).toEqual([]);
    expect(await schedule(2, v2, `${DAY}T11:00:00-03:00`)).toMatchObject({ ok: true });
  });

  it('recusa uma versão que não está agendada', async () => {
    const version = await prepare(1);
    expect(await cancel(1, version)).toMatchObject({
      ok: false,
      issues: [{ code: 'publication.not_scheduled' }],
    });
  });
});

describe('recusas sem gravar nada', () => {
  async function expectNothingWritten(contentId: number, version: number, status: string) {
    expect(await db.select().from(publications)).toEqual([]);
    expect(await statusOf(contentId, version)).toBe(status);
    expect(await jobs(PUBLISH_SCHEDULED_TASK)).toEqual([]);
  }

  it('horário no passado ou agora', async () => {
    const version = await prepare(1);
    for (const at of ['2026-11-04T07:59:00-03:00', NOW.toISOString()]) {
      expect(await schedule(1, version, at)).toMatchObject({
        ok: false,
        issues: [{ code: 'publication.schedule_not_future' }],
      });
    }
    await expectNothingWritten(1, version, 'aprovado');
  });

  it('versão fora de aprovado', async () => {
    const version = await prepare(1, false);
    expect(await schedule(1, version, `${DAY}T10:00:00-03:00`)).toMatchObject({
      ok: false,
      issues: [{ code: 'publication.not_approved' }],
    });
    await expectNothingWritten(1, version, 'em_revisao');
  });

  it('sem content.publish, ao agendar e ao cancelar', async () => {
    const version = await prepare(1);
    expect(await schedule(1, version, `${DAY}T10:00:00-03:00`, role('editor'))).toMatchObject({
      ok: false,
      issues: [{ code: 'forbidden' }],
    });
    await expectNothingWritten(1, version, 'aprovado');

    expect(await schedule(1, version, `${DAY}T10:00:00-03:00`)).toMatchObject({ ok: true });
    expect(await cancel(1, version, role('editor'))).toMatchObject({
      ok: false,
      issues: [{ code: 'forbidden' }],
    });
    expect(await statusOf(1, version)).toBe('agendado');
    expect(await jobs(PUBLISH_SCHEDULED_TASK)).toHaveLength(1);
  });
});
