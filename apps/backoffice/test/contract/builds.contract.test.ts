import { readFile } from 'node:fs/promises';

import { eq, sql } from 'drizzle-orm';
import type { JobHelpers } from 'graphile-worker';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import { builds, releases, siteEvents, sites } from '../../src/db/schema/index.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
import {
  lastBuilds,
  listRollbackVersions,
  loadBuildTarget,
  recentBuilds,
  requestBuildNow,
} from '../../src/domain/builds/builds.ts';
import { configureBuildWindow } from '../../src/domain/builds/schedule.ts';
import {
  rebuildOnRelease,
  resumeSite,
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
const helpers = (attempts = 1) =>
  ({ logger: silent, job: { id: '7', attempts } }) as unknown as JobHelpers;

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
    await db.execute(sql`delete from graphile_worker._private_jobs`);
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
      helpers(),
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
    await createBuildTask({ db, runtime, settings, now: () => Date.UTC(2026, 10, 11, 12) })(
      { siteId: 'exemplo-a' },
      helpers(2),
    );

    expect(during[0]).toEqual([
      expect.objectContaining({
        kind: 'build',
        status: 'rodando',
        siteId: 'exemplo-a',
        release: 'local',
        jobId: '7',
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
      jobId: '7',
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
      createBuildTask({ db, runtime, settings })({ siteId: 'exemplo-a' }, helpers()),
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

  it('a migração da execução com estado só acrescenta e relaxa, sem reescrever linhas', async () => {
    const migration = await readFile(
      new URL('../../drizzle/0019_execucao_com_estado.sql', import.meta.url),
      'utf8',
    );
    const allowed =
      /^ALTER TABLE "builds" (ADD COLUMN |ALTER COLUMN "\w+" DROP (NOT NULL|DEFAULT);$|ADD CONSTRAINT "\w+" CHECK )/;
    const statements = migration.split('--> statement-breakpoint').map((s) => s.trim());
    expect(statements.filter((statement) => !allowed.test(statement))).toEqual([]);
  });

  it('o próximo build recebe as páginas da versão ativa (trava de segurança)', async () => {
    const first = fakeRuntime({ render: { file: renderOk() }, publish: { file: publishOk() } });
    await createBuildTask({ db, runtime: first.runtime, settings })(
      { siteId: 'exemplo-a' },
      helpers(),
    );
    const second = fakeRuntime({ render: { file: renderOk() }, publish: { file: publishOk() } });
    await createBuildTask({ db, runtime: second.runtime, settings })(
      { siteId: 'exemplo-a' },
      helpers(),
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
      helpers(),
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
      helpers(),
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
      helpers(),
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
      helpers(),
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
      helpers(),
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
      helpers(),
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
      createBuildTask({ db, runtime: fake.runtime, settings })({ siteId: 'exemplo-a' }, helpers(3)),
    ).rejects.toBeInstanceOf(TransientBuildError);
    expect(await db.select().from(builds)).toMatchObject([
      { status: 'failed', failureKind: 'transient', attempt: 3 },
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
      createBuildTask({ db, runtime: fake.runtime, settings })({ siteId: 'exemplo-a' }, helpers()),
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
      helpers(),
    );
    await db.execute(sql`delete from graphile_worker._private_jobs`);
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
      helpers(),
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
    await db.execute(sql`delete from graphile_worker._private_jobs`);
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
    await db.execute(sql`delete from graphile_worker._private_jobs`);
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
      helpers(),
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
