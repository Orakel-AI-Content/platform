import { readFile } from 'node:fs/promises';

import { eq, inArray, sql } from 'drizzle-orm';
import { Logger, runOnce, type JobHelpers } from 'graphile-worker';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import {
  builds,
  OPEN_BUILD_STATUSES,
  releases,
  siteEvents,
  sites,
} from '../../src/db/schema/index.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { SYSTEM_ACTOR, type Actor } from '../../src/domain/access/rbac.ts';
import {
  cancelBuild,
  lastBuilds,
  listRollbackVersions,
  loadBuildTarget,
  recentBuilds,
  requestBuildNow,
  siteActivity,
} from '../../src/domain/builds/builds.ts';
import { configureBuildWindow } from '../../src/domain/builds/schedule.ts';
import {
  pauseSiteManually,
  previousRelease,
  rebuildOnRelease,
  resumeSite,
  revertRelease,
  setActiveVersion,
  setBuildWindow,
} from '../../src/domain/builds/site-state.ts';
import {
  failedFile,
  fakeRuntime,
  publishOk,
  renderOk,
} from '../../src/domain/builds/fake-runtime.ts';
import type { BuildSettings } from '../../src/domain/builds/plan.ts';
import type { ContainerRuntime } from '../../src/domain/builds/runtime.ts';
import { createAuthor } from '../../src/domain/content/authors.ts';
import { createSite, unresolvedPendingChangeIds } from '../../src/domain/sites/sites.ts';
import { createBuildTask, TransientBuildError } from '../../src/jobs/tasks/build.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

let db: Db;
let close: () => Promise<void>;
let config: Parameters<typeof createSite>[2];

const settings: BuildSettings = {
  image: 'site-builder',
  defaultTag: 'local',
  exportNetwork: 'orakel-export',
  publishNetwork: 'orakel-publish',
  exportApiUrl: 'http://backoffice-web:3000',
  exportBuildToken: 'b'.repeat(32),
  pageDropTolerance: 0.2,
  deploy: { target: 'local', edgeLocalUrl: 'http://edge-local:8081' },
  s3: { endpoint: 'http://s3:8333', accessKeyId: 'k', secretAccessKey: 's' },
};

const silent = { debug() {}, info() {}, warn() {}, error() {} };

/**
 * Helpers da task com o job de build do site que está na fila (o da linha `na_fila`), como o
 * Graphile Worker os entrega. Sem job na fila, um job avulso, sem linha para promover.
 */
async function helpers(attempts = 1, siteId = 'exemplo-a'): Promise<JobHelpers> {
  const { rows } = await db.execute<{ id: string; run_at: Date | string }>(
    sql`select id::text as id, run_at from graphile_worker.jobs
        where queue_name = ${`build:${siteId}`} and task_identifier = 'build'
        order by id desc limit 1`,
  );
  const job = rows[0] ?? { id: '7', run_at: new Date() };
  return {
    logger: silent,
    job: { id: job.id, attempts, max_attempts: 5, run_at: new Date(job.run_at) },
  } as unknown as JobHelpers;
}

beforeAll(async () => {
  ({ db, close } = await setupDatabase());
  const line = (await readFixture('exemplo-a')).find((l) => l.type === 'config');
  if (line?.type !== 'config') throw new Error('fixture sem config');
  config = line.data;
});
afterAll(() => close());
beforeEach(async () => {
  await resetDatabase(db);
  await db.transaction((tx) => createSite(tx, SYSTEM_ACTOR, config));
});

async function site() {
  const [row] = await db.select().from(sites).where(eq(sites.id, 'exemplo-a'));
  return row;
}

/** Eventos do site, na ordem em que foram gravados, sem id nem horário. */
async function events() {
  return db
    .select({
      siteId: siteEvents.siteId,
      kind: siteEvents.kind,
      requestedBy: siteEvents.requestedBy,
      reason: siteEvents.reason,
      culpritOrigin: siteEvents.culpritOrigin,
      culpritReference: siteEvents.culpritReference,
      previousRelease: siteEvents.previousRelease,
      release: siteEvents.release,
    })
    .from(siteEvents)
    .orderBy(siteEvents.id);
}

/** Esvazia a fila de build: os jobs e as linhas `na_fila` que os espelham. */
async function clearQueue(): Promise<void> {
  await db.execute(sql`delete from graphile_worker._private_jobs`);
  await db.delete(builds).where(eq(builds.status, 'na_fila'));
}

const noDetail = {
  reason: null,
  culpritOrigin: null,
  culpritReference: null,
  previousRelease: null,
  release: null,
};

describe('agendamento', () => {
  it('toda mudança pendente agenda o build do site, na mesma transação', async () => {
    const result = await db.execute(
      sql`select key from graphile_worker.jobs where task_identifier = 'build'`,
    );
    expect(result.rows).toEqual([{ key: 'build:exemplo-a' }]);
  });

  it('"publicar agora" exige operations.run e recusa site pausado', async () => {
    const editor = { email: 'e@orakel.local', roles: ['editor'] as const };
    expect(await db.transaction((tx) => requestBuildNow(tx, editor, 'exemplo-a'))).toMatchObject({
      ok: false,
      issues: [{ code: 'forbidden' }],
    });
    expect(await db.transaction((tx) => requestBuildNow(tx, SYSTEM_ACTOR, 'exemplo-a'))).toEqual({
      ok: true,
      value: undefined,
    });
    await db.update(sites).set({ state: 'pausado', pausedReason: 'x' });
    expect(
      await db.transaction((tx) => requestBuildNow(tx, SYSTEM_ACTOR, 'exemplo-a')),
    ).toMatchObject({ ok: false, issues: [{ code: 'site.paused' }] });
  });
});

describe('linha na fila', () => {
  const operacao = { email: 'o@orakel.local', roles: ['operacao'] as const };

  async function buildJobs(): Promise<{ id: string; runAt: Date }[]> {
    const { rows } = await db.execute<{ id: string; run_at: Date | string }>(
      sql`select id::text as id, run_at from graphile_worker.jobs
          where task_identifier = 'build' order by id`,
    );
    return rows.map((row) => ({ id: row.id, runAt: new Date(row.run_at) }));
  }

  const rows = () => db.select().from(builds).orderBy(builds.id);
  const openRows = () =>
    db.select().from(builds).where(inArray(builds.status, OPEN_BUILD_STATUSES)).orderBy(builds.id);

  /** Grava um autor no site: uma mudança pendente, que agenda o build. */
  const publish = (slug: string) =>
    db.transaction((tx) => createAuthor(tx, SYSTEM_ACTOR, 'exemplo-a', { slug, name: slug }));

  it('agendar cria a linha na_fila com o horário do job e solicitante system; a janela não cria outra', async () => {
    const [job] = await buildJobs();
    const expected = {
      siteId: 'exemplo-a',
      kind: 'build',
      jobId: job?.id,
      attempt: 1,
      status: 'na_fila',
      requestedBy: 'system',
      scheduledFor: job?.runAt,
      release: null,
      startedAt: null,
      finishedAt: null,
    };
    expect(await rows()).toEqual([expect.objectContaining(expected)]);

    await publish('ana');
    await publish('bia');
    expect(await buildJobs()).toEqual([job]);
    expect(await rows()).toEqual([expect.objectContaining(expected)]);
  });

  it('"Publicar agora" leva a linha para agora e para quem pediu; o agendamento seguinte a mantém', async () => {
    const before = Date.now();
    await db.transaction((tx) => requestBuildNow(tx, operacao, 'exemplo-a'));
    const [job] = await buildJobs();
    const [row] = await rows();
    expect(await rows()).toHaveLength(1);
    expect(row).toMatchObject({
      status: 'na_fila',
      jobId: job?.id,
      requestedBy: 'o@orakel.local',
      scheduledFor: job?.runAt,
    });
    expect(row?.scheduledFor?.getTime()).toBeGreaterThanOrEqual(before);
    expect(row?.scheduledFor?.getTime()).toBeLessThanOrEqual(Date.now());

    await publish('ana');
    expect(await rows()).toEqual([
      expect.objectContaining({ requestedBy: 'o@orakel.local', scheduledFor: row?.scheduledFor }),
    ]);
  });

  it('"Retomar" registra quem pediu', async () => {
    await db.update(sites).set({ state: 'pausado', pausedReason: 'x' });
    await db.transaction((tx) => resumeSite(tx, operacao, 'exemplo-a'));
    expect(await rows()).toEqual([
      expect.objectContaining({ status: 'na_fila', requestedBy: 'o@orakel.local' }),
    ]);
  });

  it('"Reconstruir na release" registra quem pediu', async () => {
    await db.insert(releases).values({ tag: '1.2.0' });
    await db.transaction((tx) => rebuildOnRelease(tx, operacao, 'exemplo-a', '1.2.0'));
    expect(await rows()).toEqual([
      expect.objectContaining({ status: 'na_fila', requestedBy: 'o@orakel.local' }),
    ]);
  });

  it('ao rodar, a task promove a linha na_fila a rodando, sem abrir outra', async () => {
    const [queued] = await rows();
    const fake = fakeRuntime({ render: { file: renderOk() }, publish: { file: publishOk() } });
    const during: (typeof builds.$inferSelect)[][] = [];
    const runtime = {
      ...fake.runtime,
      wait: async (...args: Parameters<ContainerRuntime['wait']>) => {
        during.push(await openRows());
        return fake.runtime.wait(...args);
      },
    };
    await createBuildTask({ db, runtime, settings })({ siteId: 'exemplo-a' }, await helpers());

    expect(during[0]).toEqual([
      expect.objectContaining({
        id: queued?.id,
        status: 'rodando',
        release: 'local',
        requestedBy: 'system',
        scheduledFor: queued?.scheduledFor,
      }),
    ]);
    expect(await rows()).toEqual([expect.objectContaining({ id: queued?.id, status: 'ok' })]);
  });

  it('pedido durante o build abre a linha de outro job, e o banco recusa duas na_fila do mesmo job', async () => {
    const [job] = await buildJobs();
    const fake = fakeRuntime({ render: { file: renderOk() }, publish: { file: publishOk() } });
    const during: { jobId: string | null; status: string }[][] = [];
    const runtime = {
      ...fake.runtime,
      wait: async (...args: Parameters<ContainerRuntime['wait']>) => {
        // Como o worker: o job está travado enquanto roda, e o add_job cria outro.
        await db.execute(sql`update graphile_worker._private_jobs
          set locked_at = now(), locked_by = 'worker' where id = ${job?.id}::bigint`);
        await publish('ana');
        during.push((await openRows()).map(({ jobId, status }) => ({ jobId, status })));
        return fake.runtime.wait(...args);
      },
    };
    await createBuildTask({ db, runtime, settings })({ siteId: 'exemplo-a' }, await helpers());

    const [, next] = await buildJobs();
    expect(next?.id).not.toBe(job?.id);
    expect(during[0]).toEqual([
      { jobId: job?.id, status: 'rodando' },
      { jobId: next?.id, status: 'na_fila' },
    ]);

    const row = { siteId: 'exemplo-a', attempt: 1, status: 'na_fila' as const, jobId: next?.id };
    await expect(db.insert(builds).values(row)).rejects.toThrow();
  });

  it('falha transitória: a tentativa fecha failed e a próxima nasce na_fila no horário da repetição', async () => {
    await db.execute(sql`update graphile_worker._private_jobs set run_at = now()`);
    const fake = fakeRuntime({
      render: { exitCode: 20, file: failedFile('transient', 'API fora') },
    });
    await runOnce({
      pgPool: db.$client,
      logger: new Logger(() => () => {}),
      taskList: { build: createBuildTask({ db, runtime: fake.runtime, settings }) },
    });
    // O Graphile Worker 0.18 não espera o fail_job: espera a trava sair.
    await vi.waitFor(async () => {
      const { rows: locked } = await db.execute<{ n: number }>(
        sql`select count(*)::int as n from graphile_worker._private_jobs where locked_at is not null`,
      );
      expect(locked[0]?.n).toBe(0);
    });

    const [job] = await buildJobs();
    const [failed, retry] = await rows();
    expect(await rows()).toHaveLength(2);
    expect(failed).toMatchObject({ status: 'failed', jobId: job?.id, attempt: 1 });
    expect(retry).toMatchObject({
      status: 'na_fila',
      jobId: job?.id,
      attempt: 2,
      requestedBy: 'system',
    });
    // O horário que o Graphile Worker gravou para a repetição, pela mesma conta de backoff.
    const drift = Math.abs((retry?.scheduledFor?.getTime() ?? 0) - (job?.runAt.getTime() ?? 0));
    expect(drift).toBeLessThan(1000);
  });

  it('na última tentativa, a falha transitória não deixa linha na_fila', async () => {
    const fake = fakeRuntime({
      render: { exitCode: 20, file: failedFile('transient', 'API fora') },
    });
    await expect(
      createBuildTask({ db, runtime: fake.runtime, settings })(
        { siteId: 'exemplo-a' },
        await helpers(5),
      ),
    ).rejects.toBeInstanceOf(TransientBuildError);
    expect(await openRows()).toEqual([]);
    expect(await rows()).toEqual([expect.objectContaining({ status: 'failed', attempt: 5 })]);
  });

  it('job ignorado por site pausado fecha a linha na_fila como cancelado', async () => {
    await db.update(sites).set({ state: 'pausado', pausedReason: 'x' });
    const fake = fakeRuntime({ render: { file: renderOk() }, publish: { file: publishOk() } });
    await createBuildTask({ db, runtime: fake.runtime, settings })(
      { siteId: 'exemplo-a' },
      await helpers(),
    );
    expect(fake.started).toHaveLength(0);
    expect(await openRows()).toEqual([]);
    expect(await rows()).toEqual([
      expect.objectContaining({ status: 'cancelado', finishedAt: expect.any(Date) as Date }),
    ]);
  });

  it('job sem linha na_fila (tentativa recuperada) grava a linha rodando ao começar', async () => {
    await db.delete(builds);
    const [job] = await buildJobs();
    const fake = fakeRuntime({ render: { file: renderOk() }, publish: { file: publishOk() } });
    await createBuildTask({ db, runtime: fake.runtime, settings })(
      { siteId: 'exemplo-a' },
      await helpers(),
    );
    expect(await rows()).toEqual([
      expect.objectContaining({
        status: 'ok',
        jobId: job?.id,
        release: 'local',
        requestedBy: null,
      }),
    ]);
  });
});

describe('cancelar a publicação', () => {
  const operacao = { email: 'o@orakel.local', roles: ['operacao'] as const };
  const cancel = (actor: Actor = operacao, siteId = 'exemplo-a') =>
    db.transaction((tx) => cancelBuild(tx, actor, siteId));

  const rows = () => db.select().from(builds).orderBy(builds.id);
  const buildJobIds = async () => {
    const { rows: jobs } = await db.execute<{ id: string }>(
      sql`select id::text as id from graphile_worker.jobs where task_identifier = 'build' order by id`,
    );
    return jobs.map((job) => job.id);
  };
  /** Como o worker: o job fica travado enquanto roda. */
  const lockJob = (jobId: string | undefined) =>
    db.execute(sql`update graphile_worker._private_jobs
      set locked_at = now(), locked_by = 'worker' where id = ${jobId}::bigint`);
  const publish = (slug: string) =>
    db.transaction((tx) => createAuthor(tx, SYSTEM_ACTOR, 'exemplo-a', { slug, name: slug }));
  const buildOk = async (versionId: string) => {
    const fake = fakeRuntime({
      render: { file: renderOk() },
      publish: { file: { ...publishOk(), versionId } },
    });
    await createBuildTask({ db, runtime: fake.runtime, settings })(
      { siteId: 'exemplo-a' },
      await helpers(),
    );
  };

  it('na fila: tira o job de build do site e fecha a linha como cancelado, sem abrir outra', async () => {
    const [queued] = await rows();
    expect(await buildJobIds()).toHaveLength(1);

    expect(await cancel()).toEqual({ ok: true, value: 'cancelado' });

    expect(await buildJobIds()).toEqual([]);
    expect(await rows()).toEqual([
      expect.objectContaining({
        id: queued?.id,
        status: 'cancelado',
        cancelRequestedBy: 'o@orakel.local',
        cancelRequestedAt: expect.any(Date) as Date,
        finishedAt: expect.any(Date) as Date,
      }),
    ]);
  });

  it('depois de cancelar, as mudanças continuam pendentes e o próximo agendamento abre outra linha na_fila', async () => {
    const pending = await unresolvedPendingChangeIds(db, 'exemplo-a');
    expect(pending.length).toBeGreaterThan(0);
    await cancel();
    expect(await unresolvedPendingChangeIds(db, 'exemplo-a')).toEqual(pending);

    await publish('ana');
    const [cancelled, next] = await rows();
    expect(await rows()).toHaveLength(2);
    expect(cancelled).toMatchObject({ status: 'cancelado' });
    expect(next).toMatchObject({
      status: 'na_fila',
      requestedBy: 'system',
      cancelRequestedBy: null,
      cancelRequestedAt: null,
    });
    expect(await buildJobIds()).toEqual([next?.jobId]);
  });

  it('rodando: grava quem pediu e quando na linha, que continua rodando, e não tira o job', async () => {
    const [queued] = await rows();
    const [jobId] = await buildJobIds();
    const fake = fakeRuntime({ render: { file: renderOk() }, publish: { file: publishOk() } });
    const during: { result: unknown; rows: unknown; jobs: string[] }[] = [];
    const runtime = {
      ...fake.runtime,
      wait: async (...args: Parameters<ContainerRuntime['wait']>) => {
        if (during.length === 0) {
          await lockJob(jobId);
          during.push({ result: await cancel(), rows: await rows(), jobs: await buildJobIds() });
        }
        return fake.runtime.wait(...args);
      },
    };
    await createBuildTask({ db, runtime, settings })({ siteId: 'exemplo-a' }, await helpers());

    expect(during[0]).toEqual({
      result: { ok: true, value: 'pedido' },
      rows: [
        expect.objectContaining({
          id: queued?.id,
          status: 'rodando',
          finishedAt: null,
          cancelRequestedBy: 'o@orakel.local',
          cancelRequestedAt: expect.any(Date) as Date,
        }),
      ],
      jobs: [jobId],
    });
  });

  it('job já pego pelo build-runner, com a linha ainda na_fila: só grava o pedido e mantém a chave', async () => {
    const [jobId] = await buildJobIds();
    await lockJob(jobId);

    expect(await cancel()).toEqual({ ok: true, value: 'pedido' });

    const { rows: jobs } = await db.execute<{ key: string | null }>(
      sql`select key from graphile_worker._private_jobs where id = ${jobId}::bigint`,
    );
    expect(jobs).toEqual([{ key: 'build:exemplo-a' }]);
    expect(await rows()).toEqual([
      expect.objectContaining({ status: 'na_fila', cancelRequestedBy: 'o@orakel.local' }),
    ]);
  });

  it('com uma rodando e outra na_fila, fecha a da fila e não toca a que roda', async () => {
    const [jobId] = await buildJobIds();
    const fake = fakeRuntime({ render: { file: renderOk() }, publish: { file: publishOk() } });
    const during: unknown[] = [];
    const runtime = {
      ...fake.runtime,
      wait: async (...args: Parameters<ContainerRuntime['wait']>) => {
        if (during.length === 0) {
          await lockJob(jobId);
          await publish('ana');
          during.push({ result: await cancel(), rows: await rows(), jobs: await buildJobIds() });
        }
        return fake.runtime.wait(...args);
      },
    };
    await createBuildTask({ db, runtime, settings })({ siteId: 'exemplo-a' }, await helpers());

    expect(during[0]).toEqual({
      result: { ok: true, value: 'cancelado' },
      rows: [
        expect.objectContaining({ jobId, status: 'rodando', cancelRequestedBy: null }),
        expect.objectContaining({ status: 'cancelado', cancelRequestedBy: 'o@orakel.local' }),
      ],
      jobs: [jobId],
    });
  });

  describe('em andamento, o build-runner interrompe', () => {
    /** Runtime que pede o cancelamento na primeira espera da etapa `on`. */
    function cancelDuring(fake: ReturnType<typeof fakeRuntime>, on: 'render' | 'publish') {
      let asked = false;
      const runtime: ContainerRuntime = {
        ...fake.runtime,
        wait: async (...args) => {
          if (!asked && args[0].startsWith(`orakel-${on}`)) {
            asked = true;
            const [jobId] = await buildJobIds();
            await lockJob(jobId);
            expect(await cancel()).toEqual({ ok: true, value: 'pedido' });
          }
          return fake.runtime.wait(...args);
        },
      };
      return runtime;
    }
    const run = async (runtime: ContainerRuntime) =>
      createBuildTask({ db, runtime, settings })({ siteId: 'exemplo-a' }, await helpers());

    it('mata o container da etapa e fecha a linha cancelado, com quem pediu', async () => {
      const [queued] = await rows();
      const fake = fakeRuntime({ render: { running: true } });
      await run(cancelDuring(fake, 'render'));

      expect(fake.killed).toEqual([expect.stringMatching(/^orakel-render-/)]);
      expect(fake.started.map((s) => s.command[0])).toEqual(['render']);
      expect(fake.removed).toEqual(fake.killed);
      expect(fake.volumes.removed).toEqual(fake.volumes.created);
      expect(await rows()).toEqual([
        expect.objectContaining({
          id: queued?.id,
          status: 'cancelado',
          cancelRequestedBy: 'o@orakel.local',
          cancelRequestedAt: expect.any(Date) as Date,
          finishedAt: expect.any(Date) as Date,
          failedStage: null,
          failureKind: null,
        }),
      ]);
    });

    it('o job termina sem lançar, sem repetição na fila, e o site não é pausado', async () => {
      const pending = await unresolvedPendingChangeIds(db, 'exemplo-a');
      const fake = fakeRuntime({ render: { running: true } });
      await expect(run(cancelDuring(fake, 'render'))).resolves.toBeUndefined();

      expect((await rows()).map((r) => r.status)).toEqual(['cancelado']);
      expect(await site()).toMatchObject({ state: 'ativo', pausedReason: null });
      expect(await unresolvedPendingChangeIds(db, 'exemplo-a')).toEqual(pending);
      expect(await events()).toEqual([]);
    });

    it('pedido durante o render impede o publish e a versão ativa não muda', async () => {
      await buildOk('v-1');
      await publish('ana');
      const fake = fakeRuntime({ render: { file: renderOk() }, publish: { file: publishOk() } });
      await run(cancelDuring(fake, 'render'));

      expect(fake.started.map((s) => s.command[0])).toEqual(['render']);
      expect(await site()).toMatchObject({ state: 'ativo', activeVersionId: 'v-1' });
      expect((await rows()).at(-1)).toMatchObject({ status: 'cancelado', pages: 12 });
    });

    it('build que termina antes de o pedido ser visto fecha com o resultado real', async () => {
      const ok = fakeRuntime({
        render: { file: renderOk() },
        publish: { file: { ...publishOk(), versionId: 'v-ok' } },
      });
      await run(cancelDuring(ok, 'publish'));
      expect((await rows()).at(-1)).toMatchObject({ status: 'ok', versionId: 'v-ok' });
      expect(await site()).toMatchObject({ activeVersionId: 'v-ok' });

      await publish('ana');
      const failing = fakeRuntime({
        render: { file: renderOk() },
        publish: { exitCode: 10, file: failedFile('permanent', 'alvo recusou') },
      });
      await run(cancelDuring(failing, 'publish'));
      expect((await rows()).at(-1)).toMatchObject({
        status: 'failed',
        failedStage: 'publish',
        failureKind: 'permanent',
      });
    });
  });

  it('sem publicação aberta recusa com erro próprio; sem operations.run, com forbidden', async () => {
    const editor = { email: 'e@orakel.local', roles: ['editor'] as const };
    expect(await cancel(editor)).toMatchObject({ ok: false, issues: [{ code: 'forbidden' }] });
    expect(await rows()).toEqual([expect.objectContaining({ status: 'na_fila' })]);

    await clearQueue();
    expect(await cancel()).toMatchObject({ ok: false, issues: [{ code: 'build.not_open' }] });
    expect(await cancel(operacao, 'nao-existe')).toMatchObject({
      ok: false,
      issues: [{ code: 'site.not_found' }],
    });
  });

  it('a linha cancelada não vira versão ativa, versão do "Reverter" nem pausa o site', async () => {
    await buildOk('v-1');
    await buildOk('v-2');
    await publish('ana');
    const read = async () => ({
      site: await site(),
      target: await loadBuildTarget(db, 'exemplo-a'),
      rollback: await listRollbackVersions(db, operacao, 'exemplo-a'),
      last: (await lastBuilds(db)).get('exemplo-a'),
      recent: await recentBuilds(db, 'exemplo-a'),
    });
    const before = await read();
    expect(before.site).toMatchObject({ state: 'ativo', activeVersionId: 'v-2' });

    expect(await cancel()).toEqual({ ok: true, value: 'cancelado' });

    expect(await read()).toEqual(before);
    expect(await events()).toEqual([]);
  });
});

describe('janela por site', () => {
  async function runAt(siteId: string): Promise<number[]> {
    const result = await db.execute<{ run_at: Date }>(
      sql`select run_at from graphile_worker.jobs where key = ${`build:${siteId}`}`,
    );
    return result.rows.map((row) => new Date(row.run_at).getTime());
  }

  /** Publica (grava um autor) e devolve o intervalo de tempo em volta da gravação. */
  async function publish(siteId: string, slug: string): Promise<[number, number]> {
    const before = Date.now();
    await db.transaction((tx) => createAuthor(tx, SYSTEM_ACTOR, siteId, { slug, name: slug }));
    return [before, Date.now()];
  }

  function expectRunAt([runAtMs]: number[], [before, after]: [number, number], windowMs: number) {
    expect(runAtMs).toBeGreaterThanOrEqual(before + windowMs);
    expect(runAtMs).toBeLessThanOrEqual(after + windowMs);
  }

  beforeEach(async () => {
    const line = (await readFixture('exemplo-b')).find((l) => l.type === 'config');
    if (line?.type !== 'config') throw new Error('fixture sem config');
    await db.transaction((tx) => createSite(tx, SYSTEM_ACTOR, line.data));
    await clearQueue();
  });

  it('cada site agenda com a própria janela', async () => {
    await db.transaction((tx) => setBuildWindow(tx, SYSTEM_ACTOR, 'exemplo-a', 30));
    await db.transaction((tx) => setBuildWindow(tx, SYSTEM_ACTOR, 'exemplo-b', 120));
    const a = await publish('exemplo-a', 'ana');
    const b = await publish('exemplo-b', 'bia');

    expectRunAt(await runAt('exemplo-a'), a, 30_000);
    expectRunAt(await runAt('exemplo-b'), b, 120_000);
  });

  it('sem janela própria, ou com ela limpa, vale a padrão', async () => {
    configureBuildWindow(45_000);
    try {
      const ana = await publish('exemplo-a', 'ana');
      expectRunAt(await runAt('exemplo-a'), ana, 45_000);

      await db.transaction((tx) => setBuildWindow(tx, SYSTEM_ACTOR, 'exemplo-b', 120));
      await db.transaction((tx) => setBuildWindow(tx, SYSTEM_ACTOR, 'exemplo-b', null));
      const bia = await publish('exemplo-b', 'bia');
      expectRunAt(await runAt('exemplo-b'), bia, 45_000);
    } finally {
      configureBuildWindow(15 * 60_000);
    }
  });

  it('janela 0 agenda para já', async () => {
    await db.transaction((tx) => setBuildWindow(tx, SYSTEM_ACTOR, 'exemplo-a', 0));
    const ana = await publish('exemplo-a', 'ana');
    expectRunAt(await runAt('exemplo-a'), ana, 0);
  });

  it('publicações dentro da janela caem no mesmo job', async () => {
    await db.transaction((tx) => setBuildWindow(tx, SYSTEM_ACTOR, 'exemplo-a', 30));
    await publish('exemplo-a', 'ana');
    const first = await runAt('exemplo-a');
    await publish('exemplo-a', 'bia');

    expect(await runAt('exemplo-a')).toEqual(first);
  });

  it('definir a janela não cria mudança pendente', async () => {
    const before = await unresolvedPendingChangeIds(db, 'exemplo-a');
    await db.transaction((tx) => setBuildWindow(tx, SYSTEM_ACTOR, 'exemplo-a', 30));

    expect(await unresolvedPendingChangeIds(db, 'exemplo-a')).toEqual(before);
    expect(await runAt('exemplo-a')).toEqual([]);
  });

  it('recusa janela negativa, no domínio e no banco', async () => {
    expect(
      await db.transaction((tx) => setBuildWindow(tx, SYSTEM_ACTOR, 'exemplo-a', -1)),
    ).toMatchObject({ ok: false, issues: [{ code: 'site.build_window_invalid' }] });
    expect(await site()).toMatchObject({ buildWindowSeconds: null });

    await expect(
      db.update(sites).set({ buildWindowSeconds: -1 }).where(eq(sites.id, 'exemplo-a')),
    ).rejects.toThrow();
  });

  it('recusa site inexistente', async () => {
    expect(
      await db.transaction((tx) => setBuildWindow(tx, SYSTEM_ACTOR, 'outro', 30)),
    ).toMatchObject({ ok: false, issues: [{ code: 'site.not_found' }] });
  });

  it.each(['editor', 'revisor'] as const)('%s não define a janela', async (role) => {
    const actor = { email: `${role}@orakel.local`, roles: [role] };
    expect(await db.transaction((tx) => setBuildWindow(tx, actor, 'exemplo-a', 30))).toMatchObject({
      ok: false,
      issues: [{ code: 'forbidden' }],
    });
    expect(await site()).toMatchObject({ buildWindowSeconds: null });
  });
});

describe('task build', () => {
  it('sucesso: grava o build, baixa só as mudanças que o snapshot viu e publica o site', async () => {
    const seen = await unresolvedPendingChangeIds(db, 'exemplo-a');
    // Mudança confirmada depois do snapshot: fora da lista do render, continua pendente.
    await db.transaction((tx) =>
      createAuthor(tx, SYSTEM_ACTOR, 'exemplo-a', { slug: 'ana', name: 'Ana' }),
    );
    const fake = fakeRuntime({
      render: { file: renderOk('exemplo-a', seen) },
      publish: { file: publishOk() },
    });
    await createBuildTask({ db, runtime: fake.runtime, settings })(
      { siteId: 'exemplo-a' },
      await helpers(),
    );

    const [build] = await db.select().from(builds);
    expect(build).toMatchObject({
      status: 'ok',
      release: 'local',
      attempt: 1,
      pendingChangeIds: seen,
      pages: 12,
      versionId: '20261001T120000Z-abcdef12',
    });
    expect(await unresolvedPendingChangeIds(db, 'exemplo-a')).toHaveLength(1);
    expect(await site()).toMatchObject({
      lifecycle: 'publicado',
      state: 'ativo',
      activeVersionId: '20261001T120000Z-abcdef12',
    });
  });

  it('a tentativa nasce rodando, visível durante a execução, e a mesma linha é fechada', async () => {
    const fake = fakeRuntime({ render: { file: renderOk() }, publish: { file: publishOk() } });
    const during: (typeof builds.$inferSelect)[][] = [];
    const runtime = {
      ...fake.runtime,
      // Outra conexão do pool, no meio do render: a linha já está confirmada.
      wait: async (...args: Parameters<ContainerRuntime['wait']>) => {
        during.push(await db.select().from(builds));
        return fake.runtime.wait(...args);
      },
    };
    const job = await helpers(2);
    await createBuildTask({ db, runtime, settings, now: () => Date.UTC(2026, 10, 11, 12) })(
      { siteId: 'exemplo-a' },
      job,
    );

    expect(during[0]).toEqual([
      expect.objectContaining({
        kind: 'build',
        status: 'rodando',
        siteId: 'exemplo-a',
        release: 'local',
        jobId: job.job.id,
        attempt: 2,
        startedAt: new Date(Date.UTC(2026, 10, 11, 12)),
        finishedAt: null,
      }),
    ]);
    const after = await db.select().from(builds);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({
      id: during[0]?.[0]?.id,
      kind: 'build',
      status: 'ok',
      jobId: job.job.id,
      attempt: 2,
      startedAt: new Date(Date.UTC(2026, 10, 11, 12)),
      versionId: '20261001T120000Z-abcdef12',
    });
    expect(after[0]?.finishedAt).toBeInstanceOf(Date);
  });

  it('a falha fecha a mesma linha que nasceu rodando', async () => {
    const fake = fakeRuntime({
      render: { exitCode: 20, file: failedFile('transient', 'API fora') },
    });
    const during: { id: number; status: string }[][] = [];
    const runtime = {
      ...fake.runtime,
      wait: async (...args: Parameters<ContainerRuntime['wait']>) => {
        during.push(await db.select({ id: builds.id, status: builds.status }).from(builds));
        return fake.runtime.wait(...args);
      },
    };
    await expect(
      createBuildTask({ db, runtime, settings })({ siteId: 'exemplo-a' }, await helpers()),
    ).rejects.toBeInstanceOf(TransientBuildError);

    expect(during[0]).toEqual([{ id: expect.any(Number) as number, status: 'rodando' }]);
    expect(await db.select().from(builds)).toMatchObject([
      {
        id: during[0]?.[0]?.id,
        status: 'failed',
        failedStage: 'render',
        failureKind: 'transient',
        failureMessage: 'API fora',
      },
      // A repetição do Graphile Worker: a próxima tentativa nasce na fila.
      { status: 'na_fila', attempt: 2 },
    ]);
  });

  it('durante o build, a linha rodando mostra a etapa render e depois publish', async () => {
    const fake = fakeRuntime({ render: { file: renderOk() }, publish: { file: publishOk() } });
    const during: { status: string; currentStage: string | null }[] = [];
    const runtime = {
      ...fake.runtime,
      wait: async (...args: Parameters<ContainerRuntime['wait']>) => {
        during.push(
          ...(await db
            .select({ status: builds.status, currentStage: builds.currentStage })
            .from(builds)),
        );
        return fake.runtime.wait(...args);
      },
    };
    await createBuildTask({ db, runtime, settings })({ siteId: 'exemplo-a' }, await helpers());

    expect(during).toEqual([
      { status: 'rodando', currentStage: 'render' },
      { status: 'rodando', currentStage: 'publish' },
    ]);
  });

  it('a falha guarda a etapa, a mensagem e o fim do log do container daquela etapa, limitado', async () => {
    const lines = Array.from({ length: 500 }, (_, i) => `linha ${i} ${'x'.repeat(100)}`);
    const fake = fakeRuntime({
      render: { file: renderOk(), log: 'render: 12 páginas' },
      publish: {
        exitCode: 10,
        file: { ...failedFile('permanent', 'token recusado'), release: undefined },
        log: lines.join('\n'),
      },
    });
    await createBuildTask({ db, runtime: fake.runtime, settings })(
      { siteId: 'exemplo-a' },
      await helpers(),
    );

    const [build] = await db.select().from(builds);
    expect(build).toMatchObject({
      status: 'failed',
      failedStage: 'publish',
      failureKind: 'permanent',
      failureMessage: 'token recusado',
    });
    const logTail = build?.logTail ?? '';
    expect(logTail.endsWith(lines[499] ?? '')).toBe(true);
    expect(logTail).not.toContain('render: 12 páginas');
    expect(logTail.split('\n').length).toBeLessThanOrEqual(200);
    expect(new TextEncoder().encode(logTail).length).toBeLessThanOrEqual(16 * 1024);
  });

  it('falha ao ler o log não muda o resultado nem a classificação do build', async () => {
    const fake = fakeRuntime({
      render: { exitCode: 20, file: failedFile('transient', 'API fora') },
      failOn: 'logs',
    });
    await expect(
      createBuildTask({ db, runtime: fake.runtime, settings })(
        { siteId: 'exemplo-a' },
        await helpers(5),
      ),
    ).rejects.toBeInstanceOf(TransientBuildError);
    expect(await db.select().from(builds)).toMatchObject([
      {
        status: 'failed',
        failedStage: 'render',
        failureKind: 'transient',
        failureMessage: 'API fora',
        logTail: null,
      },
    ]);
  });

  it('o banco só aceita linha aberta sem fim e linha fechada com fim', async () => {
    const row = { siteId: 'exemplo-a', release: 'local', attempt: 1, startedAt: new Date() };
    await expect(
      db.insert(builds).values({ ...row, status: 'rodando', finishedAt: new Date() }),
    ).rejects.toThrow();
    await expect(db.insert(builds).values({ ...row, status: 'ok' })).rejects.toThrow();
    await db.insert(builds).values({ ...row, status: 'rodando' });
    await db.insert(builds).values({ ...row, status: 'na_fila', startedAt: null });
  });

  it.each(['0019_execucao_com_estado', '0020_build_na_fila'])(
    'a migração %s só acrescenta e relaxa, sem reescrever linhas',
    async (name) => {
      const migration = await readFile(
        new URL(`../../drizzle/${name}.sql`, import.meta.url),
        'utf8',
      );
      const allowed =
        /^(ALTER TABLE "builds" (ADD COLUMN |ALTER COLUMN "\w+" DROP (NOT NULL|DEFAULT);$|ADD CONSTRAINT "\w+" CHECK )|CREATE UNIQUE INDEX "\w+" ON "builds" )/;
      const statements = migration.split('--> statement-breakpoint').map((s) => s.trim());
      expect(statements.filter((statement) => !allowed.test(statement))).toEqual([]);
    },
  );

  it('o próximo build recebe as páginas da versão ativa (trava de segurança)', async () => {
    const first = fakeRuntime({ render: { file: renderOk() }, publish: { file: publishOk() } });
    await createBuildTask({ db, runtime: first.runtime, settings })(
      { siteId: 'exemplo-a' },
      await helpers(),
    );
    const second = fakeRuntime({ render: { file: renderOk() }, publish: { file: publishOk() } });
    await createBuildTask({ db, runtime: second.runtime, settings })(
      { siteId: 'exemplo-a' },
      await helpers(),
    );
    expect(second.started[0]?.env).toMatchObject({ ACTIVE_PAGE_COUNT: '12' });
  });

  /** Roda um build com sucesso que publica `versionId` com `pages` páginas. */
  async function buildOk(versionId: string, pages: number) {
    const fake = fakeRuntime({
      render: { file: { ...renderOk(), pages } },
      publish: { file: { ...publishOk(), versionId } },
    });
    await createBuildTask({ db, runtime: fake.runtime, settings })(
      { siteId: 'exemplo-a' },
      await helpers(),
    );
    return fake;
  }

  it('a trava usa as páginas do build da versão ativa, não do último build ok', async () => {
    await buildOk('v-antiga', 12);
    await buildOk('v-nova', 30);
    expect(await site()).toMatchObject({ activeVersionId: 'v-nova' });
    // Como depois de um rollback: a versão no ar volta a ser a antiga.
    await db.transaction((tx) => setActiveVersion(tx, 'exemplo-a', 'v-antiga'));

    const next = await buildOk('v-seguinte', 12);
    expect(next.started[0]?.env).toMatchObject({ ACTIVE_PAGE_COUNT: '12' });
  });

  it('linha aberta não muda a versão ativa, o "Reverter", o último build nem os recentes', async () => {
    const operacao = { email: 'o@orakel.local', roles: ['operacao'] as const };
    await buildOk('v-1', 12);
    await buildOk('v-2', 30);
    const read = async () => ({
      target: await loadBuildTarget(db, 'exemplo-a'),
      rollback: await listRollbackVersions(db, operacao, 'exemplo-a'),
      last: (await lastBuilds(db)).get('exemplo-a'),
      recent: await recentBuilds(db, 'exemplo-a'),
    });
    const before = await read();
    expect(before.target).toMatchObject({ activePages: 30 });
    expect(before.last).toMatchObject({ status: 'ok', versionId: 'v-2' });

    const open = { siteId: 'exemplo-a', release: 'local', attempt: 1 };
    await db.insert(builds).values([
      // A versão ativa numa linha aberta, com outra contagem: não pode virar a referência.
      { ...open, status: 'rodando', startedAt: new Date(), versionId: 'v-2', pages: 999 },
      { ...open, status: 'na_fila', scheduledFor: new Date(), versionId: 'v-3' },
    ]);

    expect(await read()).toEqual(before);
  });

  it('sem build da versão ativa, a trava fica sem referência', async () => {
    await buildOk('v-1', 12);
    await db.transaction((tx) => setActiveVersion(tx, 'exemplo-a', 'v-sem-build'));

    const next = await buildOk('v-2', 12);
    expect(next.started[0]?.env).not.toHaveProperty('ACTIVE_PAGE_COUNT');
  });

  it('o backfill da migração põe no ar a versão do último build ok', async () => {
    await buildOk('v-1', 12);
    await buildOk('v-2', 12);
    // Um build que falhou depois não conta: não tem versão.
    const failed = fakeRuntime({ render: { exitCode: 10, file: failedFile('permanent', 'x') } });
    await createBuildTask({ db, runtime: failed.runtime, settings })(
      { siteId: 'exemplo-a' },
      await helpers(),
    );
    await db.update(sites).set({ activeVersionId: null });

    const migration = await readFile(
      new URL('../../drizzle/0011_versao_ativa_e_culpado.sql', import.meta.url),
      'utf8',
    );
    const backfill = migration.split('--> statement-breakpoint').at(-1) ?? '';
    await db.execute(sql.raw(backfill));
    expect(await site()).toMatchObject({ activeVersionId: 'v-2' });

    // Idempotente: não sobrescreve uma versão ativa já gravada.
    await db.update(sites).set({ activeVersionId: 'v-1' });
    await db.execute(sql.raw(backfill));
    expect(await site()).toMatchObject({ activeVersionId: 'v-1' });
  });

  it('falha permanente: pausa o site com o motivo e as mudanças continuam pendentes', async () => {
    const before = await unresolvedPendingChangeIds(db, 'exemplo-a');
    const fake = fakeRuntime({
      render: { exitCode: 10, file: failedFile('permanent', 'Orçamento de JS: artigo 18 kB') },
    });
    await createBuildTask({ db, runtime: fake.runtime, settings })(
      { siteId: 'exemplo-a' },
      await helpers(),
    );

    expect(await site()).toMatchObject({
      state: 'pausado',
      pausedReason: 'render: Orçamento de JS: artigo 18 kB',
      pausedCulpritOrigin: null,
      pausedCulpritReference: null,
    });
    expect(await db.select().from(builds)).toMatchObject([
      { status: 'failed', failedStage: 'render', failureKind: 'permanent' },
    ]);
    expect(await unresolvedPendingChangeIds(db, 'exemplo-a')).toEqual(before);
    expect(await events()).toEqual([
      {
        ...noDetail,
        siteId: 'exemplo-a',
        kind: 'pausa',
        requestedBy: 'system',
        reason: 'render: Orçamento de JS: artigo 18 kB',
      },
    ]);

    // Pausado: o próximo build nem cria containers.
    const next = fakeRuntime({ render: { file: renderOk() }, publish: { file: publishOk() } });
    await createBuildTask({ db, runtime: next.runtime, settings })(
      { siteId: 'exemplo-a' },
      await helpers(),
    );
    expect(next.started).toHaveLength(0);
  });

  it('falha permanente com culpado: grava o culpado junto do motivo', async () => {
    const fake = fakeRuntime({
      render: {
        exitCode: 10,
        file: failedFile('permanent', 'Snapshot inválido', 'exemplo-a', {
          origin: 'content',
          reference: '42',
        }),
      },
    });
    await createBuildTask({ db, runtime: fake.runtime, settings })(
      { siteId: 'exemplo-a' },
      await helpers(),
    );

    expect(await site()).toMatchObject({
      state: 'pausado',
      pausedReason: 'render: Snapshot inválido',
      pausedCulpritOrigin: 'content',
      pausedCulpritReference: '42',
    });
    expect(await events()).toMatchObject([
      {
        kind: 'pausa',
        requestedBy: 'system',
        reason: 'render: Snapshot inválido',
        culpritOrigin: 'content',
        culpritReference: '42',
      },
    ]);
  });

  it('falha permanente sem culpado limpa o culpado de uma pausa anterior', async () => {
    await db
      .update(sites)
      .set({ pausedCulpritOrigin: 'author', pausedCulpritReference: '7' })
      .where(eq(sites.id, 'exemplo-a'));
    const fake = fakeRuntime({
      render: { exitCode: 10, file: failedFile('permanent', 'Orçamento de JS') },
    });
    await createBuildTask({ db, runtime: fake.runtime, settings })(
      { siteId: 'exemplo-a' },
      await helpers(),
    );

    expect(await site()).toMatchObject({
      state: 'pausado',
      pausedCulpritOrigin: null,
      pausedCulpritReference: null,
    });
  });

  it('o banco recusa culpado pela metade', async () => {
    await expect(
      db.update(sites).set({ pausedCulpritOrigin: 'content' }).where(eq(sites.id, 'exemplo-a')),
    ).rejects.toThrow();
  });

  it('falha transitória: registra a tentativa e lança para o Graphile Worker repetir', async () => {
    const fake = fakeRuntime({
      render: { exitCode: 20, file: failedFile('transient', 'API fora') },
    });
    await expect(
      createBuildTask({ db, runtime: fake.runtime, settings })(
        { siteId: 'exemplo-a' },
        await helpers(3),
      ),
    ).rejects.toBeInstanceOf(TransientBuildError);
    expect(await db.select().from(builds).orderBy(builds.id)).toMatchObject([
      { status: 'failed', failureKind: 'transient', attempt: 3 },
      { status: 'na_fila', attempt: 4 },
    ]);
    expect(await site()).toMatchObject({ state: 'ativo' });
    expect(await events()).toEqual([]);
  });

  it('falha transitória não mexe na versão ativa nem no culpado', async () => {
    await buildOk('v-1', 12);
    await db
      .update(sites)
      .set({ pausedCulpritOrigin: 'menu', pausedCulpritReference: 'principal' })
      .where(eq(sites.id, 'exemplo-a'));
    const fake = fakeRuntime({
      render: {
        exitCode: 20,
        file: failedFile('transient', 'API fora', 'exemplo-a', {
          origin: 'content',
          reference: '42',
        }),
      },
    });
    await expect(
      createBuildTask({ db, runtime: fake.runtime, settings })(
        { siteId: 'exemplo-a' },
        await helpers(),
      ),
    ).rejects.toBeInstanceOf(TransientBuildError);

    expect(await site()).toMatchObject({
      activeVersionId: 'v-1',
      pausedCulpritOrigin: 'menu',
      pausedCulpritReference: 'principal',
    });
  });
});

describe('retomar', () => {
  const operacao = { email: 'o@orakel.local', roles: ['operacao'] as const };

  /** Falha permanente com culpado: o site pausa e as mudanças ficam represadas. */
  async function pauseByCulprit(): Promise<void> {
    const fake = fakeRuntime({
      render: {
        exitCode: 10,
        file: failedFile('permanent', 'Snapshot inválido', 'exemplo-a', {
          origin: 'content',
          reference: '42',
        }),
      },
    });
    await createBuildTask({ db, runtime: fake.runtime, settings })(
      { siteId: 'exemplo-a' },
      await helpers(),
    );
    await clearQueue();
  }

  async function buildJobs(): Promise<{ key: string; run_at: Date }[]> {
    const result = await db.execute<{ key: string; run_at: Date }>(
      sql`select key, run_at from graphile_worker.jobs where task_identifier = 'build'`,
    );
    return result.rows;
  }

  it('volta o site a ativo, limpa motivo e culpado e enfileira o build já', async () => {
    await pauseByCulprit();
    const before = Date.now();
    expect(await db.transaction((tx) => resumeSite(tx, operacao, 'exemplo-a'))).toEqual({
      ok: true,
      value: undefined,
    });

    expect(await site()).toMatchObject({
      state: 'ativo',
      pausedReason: null,
      pausedCulpritOrigin: null,
      pausedCulpritReference: null,
    });
    const jobs = await buildJobs();
    expect(jobs.map((job) => job.key)).toEqual(['build:exemplo-a']);
    expect(new Date(jobs[0]?.run_at ?? 0).getTime()).toBeLessThanOrEqual(Date.now());
    expect(new Date(jobs[0]?.run_at ?? 0).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(await events()).toMatchObject([
      { kind: 'pausa', requestedBy: 'system' },
      { ...noDetail, siteId: 'exemplo-a', kind: 'retomada', requestedBy: 'o@orakel.local' },
    ]);
  });

  it('a retomada é gravada na transação dela: se a transação falha, nenhum evento fica', async () => {
    await pauseByCulprit();
    await expect(
      db.transaction(async (tx) => {
        await resumeSite(tx, operacao, 'exemplo-a');
        throw new Error('falha depois da retomada');
      }),
    ).rejects.toThrow('falha depois da retomada');

    expect(await site()).toMatchObject({ state: 'pausado' });
    expect((await events()).map((event) => event.kind)).toEqual(['pausa']);
  });

  it('com o culpado corrigido, o build seguinte publica as mudanças represadas', async () => {
    await pauseByCulprit();
    const held = await unresolvedPendingChangeIds(db, 'exemplo-a');
    expect(held.length).toBeGreaterThan(0);
    await db.transaction((tx) => resumeSite(tx, SYSTEM_ACTOR, 'exemplo-a'));

    const fake = fakeRuntime({
      render: { file: renderOk('exemplo-a', held) },
      publish: { file: publishOk() },
    });
    await createBuildTask({ db, runtime: fake.runtime, settings })(
      { siteId: 'exemplo-a' },
      await helpers(),
    );

    expect(await unresolvedPendingChangeIds(db, 'exemplo-a')).toEqual([]);
    expect(await site()).toMatchObject({
      state: 'ativo',
      lifecycle: 'publicado',
      activeVersionId: '20261001T120000Z-abcdef12',
    });
  });

  it('não cria mudança pendente nem muda a versão ativa', async () => {
    await pauseByCulprit();
    await db.transaction((tx) => setActiveVersion(tx, 'exemplo-a', 'v-1'));
    const held = await unresolvedPendingChangeIds(db, 'exemplo-a');
    await db.transaction((tx) => resumeSite(tx, SYSTEM_ACTOR, 'exemplo-a'));

    expect(await unresolvedPendingChangeIds(db, 'exemplo-a')).toEqual(held);
    expect(await site()).toMatchObject({ activeVersionId: 'v-1' });
  });

  it('recusa site que não está pausado, sem enfileirar', async () => {
    await clearQueue();
    expect(await db.transaction((tx) => resumeSite(tx, SYSTEM_ACTOR, 'exemplo-a'))).toMatchObject({
      ok: false,
      issues: [{ code: 'site.not_paused' }],
    });
    expect(await buildJobs()).toEqual([]);
    expect(await events()).toEqual([]);
  });

  it('recusa site inexistente', async () => {
    expect(await db.transaction((tx) => resumeSite(tx, SYSTEM_ACTOR, 'nao-existe'))).toMatchObject({
      ok: false,
      issues: [{ code: 'site.not_found' }],
    });
  });

  it('editor e revisor recebem forbidden e o site continua pausado', async () => {
    await pauseByCulprit();
    for (const role of ['editor', 'revisor'] as const) {
      const actor = { email: `${role}@orakel.local`, roles: [role] };
      expect(await db.transaction((tx) => resumeSite(tx, actor, 'exemplo-a'))).toMatchObject({
        ok: false,
        issues: [{ code: 'forbidden' }],
      });
    }
    expect(await site()).toMatchObject({ state: 'pausado', pausedCulpritReference: '42' });
    expect(await buildJobs()).toEqual([]);
    expect((await events()).map((event) => event.kind)).toEqual(['pausa']);
  });

  it('de dois "Retomar" seguidos, só o primeiro passa e grava evento', async () => {
    await pauseByCulprit();
    expect(await db.transaction((tx) => resumeSite(tx, operacao, 'exemplo-a'))).toMatchObject({
      ok: true,
    });
    expect(await db.transaction((tx) => resumeSite(tx, operacao, 'exemplo-a'))).toMatchObject({
      ok: false,
      issues: [{ code: 'site.not_paused' }],
    });
    expect((await events()).map((event) => event.kind)).toEqual(['pausa', 'retomada']);
  });
});

describe('reconstruir na release', () => {
  const operacao = { email: 'o@orakel.local', roles: ['operacao'] as const };

  beforeEach(async () => {
    await db.insert(releases).values([{ tag: '1.2.0' }, { tag: '1.3.0' }]);
    await clearQueue();
  });

  async function buildJobs(): Promise<{ key: string; run_at: Date }[]> {
    const result = await db.execute<{ key: string; run_at: Date }>(
      sql`select key, run_at from graphile_worker.jobs where task_identifier = 'build'`,
    );
    return result.rows;
  }

  async function pause(): Promise<void> {
    await db
      .update(sites)
      .set({
        state: 'pausado',
        pausedReason: 'Snapshot inválido',
        pausedCulpritOrigin: 'content',
        pausedCulpritReference: '42',
      })
      .where(eq(sites.id, 'exemplo-a'));
  }

  it('site pausado: grava a release, retoma e enfileira o build já', async () => {
    await pause();
    const before = Date.now();
    expect(
      await db.transaction((tx) => rebuildOnRelease(tx, operacao, 'exemplo-a', '1.2.0')),
    ).toEqual({ ok: true, value: undefined });

    expect(await site()).toMatchObject({
      release: '1.2.0',
      state: 'ativo',
      pausedReason: null,
      pausedCulpritOrigin: null,
      pausedCulpritReference: null,
    });
    const jobs = await buildJobs();
    expect(jobs.map((job) => job.key)).toEqual(['build:exemplo-a']);
    expect(new Date(jobs[0]?.run_at ?? 0).getTime()).toBeLessThanOrEqual(Date.now());
    expect(new Date(jobs[0]?.run_at ?? 0).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(await events()).toEqual([
      {
        ...noDetail,
        siteId: 'exemplo-a',
        kind: 'troca_de_versao',
        requestedBy: 'o@orakel.local',
        release: '1.2.0',
      },
      { ...noDetail, siteId: 'exemplo-a', kind: 'retomada', requestedBy: 'o@orakel.local' },
    ]);
  });

  it('site ativo também é reconstruído, sem recusa de site não pausado', async () => {
    expect(
      await db.transaction((tx) => rebuildOnRelease(tx, operacao, 'exemplo-a', '1.3.0')),
    ).toEqual({ ok: true, value: undefined });
    expect(await site()).toMatchObject({ release: '1.3.0', state: 'ativo' });
    expect((await buildJobs()).map((job) => job.key)).toEqual(['build:exemplo-a']);
    expect(await events()).toMatchObject([
      { kind: 'troca_de_versao', previousRelease: null, release: '1.3.0' },
    ]);
  });

  it('a troca seguinte registra a release anterior e a nova', async () => {
    await db.transaction((tx) => rebuildOnRelease(tx, operacao, 'exemplo-a', '1.2.0'));
    await db.transaction((tx) => rebuildOnRelease(tx, operacao, 'exemplo-a', '1.3.0'));
    expect(await events()).toMatchObject([
      { kind: 'troca_de_versao', previousRelease: null, release: '1.2.0' },
      {
        kind: 'troca_de_versao',
        requestedBy: 'o@orakel.local',
        previousRelease: '1.2.0',
        release: '1.3.0',
      },
    ]);
  });

  it('se a transação da troca falha, nenhum evento fica', async () => {
    await pause();
    await expect(
      db.transaction(async (tx) => {
        await rebuildOnRelease(tx, operacao, 'exemplo-a', '1.2.0');
        throw new Error('falha depois da troca');
      }),
    ).rejects.toThrow('falha depois da troca');

    expect(await site()).toMatchObject({ release: null, state: 'pausado' });
    expect(await events()).toEqual([]);
  });

  it('o build seguinte publica com a imagem site-builder:<release> e registra a release', async () => {
    await db.transaction((tx) => rebuildOnRelease(tx, operacao, 'exemplo-a', '1.2.0'));
    const fake = fakeRuntime({ render: { file: renderOk() }, publish: { file: publishOk() } });
    await createBuildTask({ db, runtime: fake.runtime, settings })(
      { siteId: 'exemplo-a' },
      await helpers(),
    );

    expect(fake.started.map((spec) => spec.image)).toEqual([
      'site-builder:1.2.0',
      'site-builder:1.2.0',
    ]);
    const [build] = await db.select().from(builds);
    expect(build).toMatchObject({ status: 'ok', release: '1.2.0' });
    expect(await site()).toMatchObject({ release: '1.2.0', lifecycle: 'publicado' });
  });

  it('recusa release não registrada, sem gravar nem enfileirar', async () => {
    await pause();
    expect(
      await db.transaction((tx) => rebuildOnRelease(tx, operacao, 'exemplo-a', '9.9.9')),
    ).toMatchObject({ ok: false, issues: [{ code: 'release.not_registered', path: ['release'] }] });
    expect(await site()).toMatchObject({ release: null, state: 'pausado' });
    expect(await buildJobs()).toEqual([]);
    expect(await events()).toEqual([]);
  });

  it.each(['gerando', 'baixando', 'falhou', 'descartada'] as const)(
    'recusa release em %s com release.not_available, sem gravar nem enfileirar',
    async (pipelineState) => {
      await pause();
      await db.insert(releases).values({ tag: '1.4.0', pipelineState });
      expect(
        await db.transaction((tx) => rebuildOnRelease(tx, operacao, 'exemplo-a', '1.4.0')),
      ).toMatchObject({
        ok: false,
        issues: [
          {
            code: 'release.not_available',
            message: expect.stringContaining(pipelineState) as unknown,
            path: ['release'],
          },
        ],
      });
      expect(await site()).toMatchObject({ release: null, state: 'pausado' });
      expect(await buildJobs()).toEqual([]);
      expect(await events()).toEqual([]);
    },
  );

  it('recusa site inexistente, sem enfileirar', async () => {
    expect(
      await db.transaction((tx) => rebuildOnRelease(tx, operacao, 'nao-existe', '1.2.0')),
    ).toMatchObject({ ok: false, issues: [{ code: 'site.not_found' }] });
    expect(await buildJobs()).toEqual([]);
  });

  it('editor e revisor recebem forbidden e nada muda', async () => {
    await pause();
    for (const role of ['editor', 'revisor'] as const) {
      const actor = { email: `${role}@orakel.local`, roles: [role] };
      expect(
        await db.transaction((tx) => rebuildOnRelease(tx, actor, 'exemplo-a', '1.2.0')),
      ).toMatchObject({ ok: false, issues: [{ code: 'forbidden' }] });
    }
    expect(await site()).toMatchObject({ release: null, state: 'pausado' });
    expect(await buildJobs()).toEqual([]);
    expect(await events()).toEqual([]);
  });
});

describe('voltar à versão anterior', () => {
  const operacao = { email: 'o@orakel.local', roles: ['operacao'] as const };
  const revert = (actor: Actor = operacao) =>
    db.transaction((tx) => revertRelease(tx, actor, 'exemplo-a'));
  const previous = (actor: Actor = operacao) => previousRelease(db, actor, 'exemplo-a');
  const switchTo = (tag: string) =>
    db.transaction((tx) => rebuildOnRelease(tx, operacao, 'exemplo-a', tag));

  beforeEach(async () => {
    await db.insert(releases).values([{ tag: '1.3.2' }, { tag: '1.4.0' }]);
    await clearQueue();
  });

  async function buildJobs(): Promise<string[]> {
    const result = await db.execute<{ key: string }>(
      sql`select key from graphile_worker.jobs where task_identifier = 'build'`,
    );
    return result.rows.map((row) => row.key);
  }

  it('com trocas 1.3.2 → 1.4.0, volta a 1.3.2 e enfileira o build; de novo, volta a 1.4.0', async () => {
    await switchTo('1.3.2');
    await switchTo('1.4.0');
    await clearQueue();
    expect(await previous()).toEqual({ ok: true, value: '1.3.2' });

    expect(await revert()).toEqual({ ok: true, value: '1.3.2' });
    expect(await site()).toMatchObject({ release: '1.3.2', state: 'ativo' });
    expect(await buildJobs()).toEqual(['build:exemplo-a']);
    expect((await events()).at(-1)).toMatchObject({
      kind: 'troca_de_versao',
      requestedBy: 'o@orakel.local',
      previousRelease: '1.4.0',
      release: '1.3.2',
    });

    expect(await previous()).toEqual({ ok: true, value: '1.4.0' });
    expect(await revert()).toEqual({ ok: true, value: '1.4.0' });
    expect(await site()).toMatchObject({ release: '1.4.0' });
    expect((await events()).at(-1)).toMatchObject({
      kind: 'troca_de_versao',
      previousRelease: '1.3.2',
      release: '1.4.0',
    });
  });

  it('site pausado volta e é retomado', async () => {
    await switchTo('1.3.2');
    await switchTo('1.4.0');
    await db
      .update(sites)
      .set({ state: 'pausado', pausedReason: 'Falha permanente' })
      .where(eq(sites.id, 'exemplo-a'));
    expect(await revert()).toEqual({ ok: true, value: '1.3.2' });
    expect(await site()).toMatchObject({ release: '1.3.2', state: 'ativo', pausedReason: null });
  });

  async function expectRefusedWithoutWriting(release: string | null): Promise<void> {
    const eventsBefore = await events();
    await clearQueue();
    expect(await previous()).toEqual({ ok: true, value: null });
    expect(await revert()).toMatchObject({
      ok: false,
      issues: [{ code: 'release.no_previous' }],
    });
    expect(await site()).toMatchObject({ release });
    expect(await events()).toEqual(eventsBefore);
    expect(await buildJobs()).toEqual([]);
  }

  it('sem troca: leitura nula e recusa sem gravar nada', async () => {
    await expectRefusedWithoutWriting(null);
  });

  it('com a anterior nula: leitura nula e recusa sem gravar nada', async () => {
    await switchTo('1.4.0');
    await expectRefusedWithoutWriting('1.4.0');
  });

  it.each(['gerando', 'baixando', 'falhou', 'descartada'] as const)(
    'com a anterior em %s: leitura nula e recusa sem gravar nada',
    async (pipelineState) => {
      await switchTo('1.3.2');
      await switchTo('1.4.0');
      await db.update(releases).set({ pipelineState }).where(eq(releases.tag, '1.3.2'));
      await expectRefusedWithoutWriting('1.4.0');
    },
  );

  it('olha só a troca mais recente, não as pausas e retomadas depois dela', async () => {
    await switchTo('1.3.2');
    await switchTo('1.4.0');
    await db.transaction((tx) => pauseSiteManually(tx, operacao, 'exemplo-a', 'Manutenção'));
    expect(await previous()).toEqual({ ok: true, value: '1.3.2' });
  });

  it('site inexistente: site.not_found', async () => {
    expect(await previousRelease(db, operacao, 'nao-existe')).toMatchObject({
      ok: false,
      issues: [{ code: 'site.not_found' }],
    });
    expect(await db.transaction((tx) => revertRelease(tx, operacao, 'nao-existe'))).toMatchObject({
      ok: false,
      issues: [{ code: 'site.not_found' }],
    });
  });

  it.each(['editor', 'revisor'] as const)('%s recebe forbidden e nada muda', async (role) => {
    await switchTo('1.3.2');
    await switchTo('1.4.0');
    const eventsBefore = await events();
    await clearQueue();
    const actor = { email: `${role}@orakel.local`, roles: [role] };
    expect(await previous(actor)).toMatchObject({ ok: false, issues: [{ code: 'forbidden' }] });
    expect(await revert(actor)).toMatchObject({ ok: false, issues: [{ code: 'forbidden' }] });
    expect(await site()).toMatchObject({ release: '1.4.0' });
    expect(await events()).toEqual(eventsBefore);
    expect(await buildJobs()).toEqual([]);
  });
});

describe('atividade do site', () => {
  const operacao = { email: 'o@orakel.local', roles: ['operacao'] as const };
  const at = (minute: number) => new Date(Date.UTC(2026, 10, 11, 12, minute));
  const activity = (limit?: number) => siteActivity(db, operacao, 'exemplo-a', limit);

  /** Grava uma execução fechada do site, terminada no minuto dado. */
  const closedRun = (minute: number, values: Partial<typeof builds.$inferInsert> = {}) =>
    db
      .insert(builds)
      .values({
        siteId: 'exemplo-a',
        attempt: 1,
        status: 'ok',
        release: '1.0.0',
        requestedBy: 'system',
        startedAt: at(minute),
        finishedAt: at(minute),
        ...values,
      })
      .returning({ id: builds.id });

  const event = (minute: number, values: Omit<typeof siteEvents.$inferInsert, 'siteId'>) =>
    db.insert(siteEvents).values({ siteId: 'exemplo-a', createdAt: at(minute), ...values });

  it('com a publicação na fila, a aberta é na_fila com o horário previsto e o solicitante', async () => {
    const [queued] = await db.select().from(builds).where(eq(builds.status, 'na_fila'));
    expect(queued?.scheduledFor).toBeInstanceOf(Date);
    expect(await activity()).toEqual({
      ok: true,
      value: {
        open: {
          id: queued?.id,
          kind: 'build',
          status: 'na_fila',
          currentStage: null,
          scheduledFor: queued?.scheduledFor,
          startedAt: null,
          requestedBy: 'system',
          cancelRequestedAt: null,
        },
        history: [],
      },
    });
  });

  it('rodando, a aberta traz a etapa corrente, e vem antes da na_fila de um pedido durante o build', async () => {
    await db
      .update(builds)
      .set({ status: 'rodando', release: '1.0.0', startedAt: at(1), currentStage: 'render' })
      .where(eq(builds.status, 'na_fila'));
    await db.insert(builds).values({
      siteId: 'exemplo-a',
      attempt: 1,
      status: 'na_fila',
      requestedBy: operacao.email,
      scheduledFor: at(2),
    });
    const result = await activity();
    expect(result).toMatchObject({
      ok: true,
      value: {
        open: { status: 'rodando', currentStage: 'render', startedAt: at(1) },
        history: [],
      },
    });
  });

  it('sem nada aberto, não há execução aberta', async () => {
    await clearQueue();
    expect(await activity()).toEqual({ ok: true, value: { open: null, history: [] } });
  });

  it('o histórico une execuções e eventos, do mais recente ao mais antigo, com tipo, quem, quando e resultado', async () => {
    await clearQueue();
    await closedRun(1, { versionId: 'v1' });
    await event(2, { kind: 'pausa', requestedBy: operacao.email, reason: 'manutenção' });
    await event(3, { kind: 'retomada', requestedBy: operacao.email });
    await closedRun(4, { kind: 'rollback', versionId: 'v0', requestedBy: operacao.email });
    await event(5, {
      kind: 'troca_de_versao',
      requestedBy: operacao.email,
      previousRelease: '1.0.0',
      release: '1.1.0',
    });
    await closedRun(6, { status: 'cancelado', release: null, cancelRequestedBy: operacao.email });

    const result = await activity();
    if (!result.ok) throw new Error('consulta recusada');
    expect(result.value.open).toBeNull();
    expect(
      result.value.history.map((item) => [item.type, item.kind, item.requestedBy, item.at]),
    ).toEqual([
      ['execucao', 'build', 'system', at(6)],
      ['evento', 'troca_de_versao', operacao.email, at(5)],
      ['execucao', 'rollback', operacao.email, at(4)],
      ['evento', 'retomada', operacao.email, at(3)],
      ['evento', 'pausa', operacao.email, at(2)],
      ['execucao', 'build', 'system', at(1)],
    ]);
    expect(result.value.history).toEqual([
      expect.objectContaining({ status: 'cancelado', cancelRequestedBy: operacao.email }),
      expect.objectContaining({ previousRelease: '1.0.0', release: '1.1.0' }),
      expect.objectContaining({ status: 'ok', versionId: 'v0', failure: null }),
      expect.objectContaining({ kind: 'retomada' }),
      expect.objectContaining({ reason: 'manutenção' }),
      expect.objectContaining({ status: 'ok', versionId: 'v1', release: '1.0.0', failure: null }),
    ]);
  });

  it('o item de uma falha traz a etapa, a mensagem e o fim do log', async () => {
    await clearQueue();
    await closedRun(1, {
      status: 'failed',
      failedStage: 'render',
      failureKind: 'permanent',
      failureMessage: 'página sem título',
      logTail: 'linha 1\nlinha 2',
    });
    const result = await activity();
    expect(result).toMatchObject({
      ok: true,
      value: {
        history: [
          {
            type: 'execucao',
            status: 'failed',
            failure: {
              stage: 'render',
              kind: 'permanent',
              message: 'página sem título',
              logTail: 'linha 1\nlinha 2',
            },
          },
        ],
      },
    });
  });

  it('com mais itens que o limite, traz exatamente o limite, só os mais recentes', async () => {
    await clearQueue();
    for (const minute of [1, 3, 5]) await closedRun(minute);
    for (const minute of [2, 4, 6]) {
      await event(minute, { kind: 'retomada', requestedBy: operacao.email });
    }
    const result = await activity(4);
    if (!result.ok) throw new Error('consulta recusada');
    expect(result.value.history.map((item) => item.at)).toEqual([at(6), at(5), at(4), at(3)]);
  });

  it('responde a editor e revisor (site.read); sem papel, forbidden; site inexistente, site.not_found', async () => {
    for (const role of ['editor', 'revisor'] as const) {
      const actor = { email: `${role}@orakel.local`, roles: [role] };
      expect(await siteActivity(db, actor, 'exemplo-a')).toMatchObject({ ok: true });
    }
    expect(
      await siteActivity(db, { email: 'x@orakel.local', roles: [] }, 'exemplo-a'),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'forbidden' }],
    });
    expect(await siteActivity(db, operacao, 'nao-existe')).toMatchObject({
      ok: false,
      issues: [{ code: 'site.not_found' }],
    });
  });
});
