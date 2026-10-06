import { eq, sql } from 'drizzle-orm';
import type { JobHelpers } from 'graphile-worker';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import { builds, sites } from '../../src/db/schema/index.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
import { requestBuildNow } from '../../src/domain/builds/builds.ts';
import { configureBuildWindow } from '../../src/domain/builds/schedule.ts';
import { setBuildWindow } from '../../src/domain/builds/site-state.ts';
import {
  failedFile,
  fakeRuntime,
  publishOk,
  renderOk,
} from '../../src/domain/builds/fake-runtime.ts';
import type { BuildSettings } from '../../src/domain/builds/plan.ts';
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
    expect(await site()).toMatchObject({ lifecycle: 'publicado', state: 'ativo' });
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
    });
    expect(await db.select().from(builds)).toMatchObject([
      { status: 'failed', failedStage: 'render', failureKind: 'permanent' },
    ]);
    expect(await unresolvedPendingChangeIds(db, 'exemplo-a')).toEqual(before);

    // Pausado: o próximo build nem cria containers.
    const next = fakeRuntime({ render: { file: renderOk() }, publish: { file: publishOk() } });
    await createBuildTask({ db, runtime: next.runtime, settings })(
      { siteId: 'exemplo-a' },
      helpers(),
    );
    expect(next.started).toHaveLength(0);
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
  });
});
