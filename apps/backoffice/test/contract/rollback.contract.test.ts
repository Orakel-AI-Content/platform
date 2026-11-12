import { eq, sql } from 'drizzle-orm';
import type { JobHelpers } from 'graphile-worker';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import { builds, sites } from '../../src/db/schema/index.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
import {
  activeBuild,
  lastBuilds,
  listRollbackVersions,
  previousVersion,
  recentBuilds,
  requestRollback,
  requestUndoLastPublish,
} from '../../src/domain/builds/builds.ts';
import { failedFile, fakeRuntime, rollbackOk } from '../../src/domain/builds/fake-runtime.ts';
import type { FakeStage } from '../../src/domain/builds/fake-runtime.ts';
import type { BuildSettings } from '../../src/domain/builds/plan.ts';
import { scheduleRollback } from '../../src/domain/builds/schedule.ts';
import { pauseSite, setActiveVersion } from '../../src/domain/builds/site-state.ts';
import { createSite } from '../../src/domain/sites/sites.ts';
import { TransientBuildError } from '../../src/jobs/tasks/build.ts';
import { createRollbackTask } from '../../src/jobs/tasks/rollback.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

let db: Db;
let close: () => Promise<void>;

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

const CURRENT = '20261020T120000Z-cccccccc';
const OLDER = '20261001T120000Z-abcdef12';

const errors: string[] = [];
const logger = {
  debug() {},
  info() {},
  warn() {},
  error(msg: string) {
    errors.push(msg);
  },
};
const REQUESTER = 'o@orakel.local';
const RUN_AT = new Date('2026-10-21T12:00:00Z');
const helpers = (jobId: string, attempts = 1) =>
  ({
    logger,
    job: { id: jobId, attempts, max_attempts: 5, run_at: RUN_AT },
  }) as unknown as JobHelpers;

beforeAll(async () => {
  ({ db, close } = await setupDatabase());
});
afterAll(() => close());
beforeEach(async () => {
  errors.length = 0;
  await resetDatabase(db);
  const line = (await readFixture('exemplo-a')).find((l) => l.type === 'config');
  if (line?.type !== 'config') throw new Error('fixture sem config');
  await db.transaction((tx) => createSite(tx, SYSTEM_ACTOR, line.data));
  await db.transaction((tx) => setActiveVersion(tx, 'exemplo-a', CURRENT));
});

async function site() {
  const [row] = await db.select().from(sites).where(eq(sites.id, 'exemplo-a'));
  return row;
}

/** Pede o rollback para OLDER e devolve o id do job, como o "Reverter" faz. */
async function queueRollback(): Promise<string> {
  await db.transaction((tx) => scheduleRollback(tx, 'exemplo-a', OLDER, REQUESTER));
  const { rows } = await db.execute<{ id: string }>(sql`
    select id::text from graphile_worker.jobs where task_identifier = 'rollback'`);
  const [job] = rows;
  if (job === undefined) throw new Error('rollback não enfileirado');
  return job.id;
}

/** Roda a tentativa `attempts` do job do pedido (ou de `jobId`, um job sem linha na fila). */
async function run(rollback: FakeStage, attempts = 1, jobId?: string) {
  const id = jobId ?? (await queueRollback());
  const fake = fakeRuntime({ rollback });
  const result = createRollbackTask({ db, runtime: fake.runtime, settings })(
    { siteId: 'exemplo-a', versionId: OLDER },
    helpers(id, attempts),
  );
  return { fake, result, jobId: id };
}

function rollbackRows() {
  return db.select().from(builds).where(eq(builds.kind, 'rollback')).orderBy(builds.id);
}

describe('task rollback', () => {
  it('sucesso: roda o container rollback com a versão pedida e ela passa a ser a ativa', async () => {
    const { fake, result } = await run({ file: rollbackOk('exemplo-a', OLDER) });
    await result;

    expect(fake.started).toHaveLength(1);
    expect(fake.started[0]).toMatchObject({
      command: ['rollback'],
      image: 'site-builder:local',
      network: 'orakel-publish',
      env: { SITE_ID: 'exemplo-a', VERSION_ID: OLDER, DEPLOY_TARGET: 'local' },
    });
    expect(Object.keys(fake.started[0]?.env ?? {}).filter((k) => /^(S3_|EXPORT_)/.test(k))).toEqual(
      [],
    );
    expect((await site())?.activeVersionId).toBe(OLDER);
    expect(fake.removed).toHaveLength(1);
    expect(fake.volumes.removed).toHaveLength(1);
  });

  it('a linha do pedido passa por rodando e fecha ok com a versão ativada', async () => {
    const { result, jobId } = await run({ file: rollbackOk('exemplo-a', OLDER) });
    await result;
    const rows = await rollbackRows();
    expect(rows).toEqual([
      expect.objectContaining({
        kind: 'rollback',
        jobId,
        attempt: 1,
        status: 'ok',
        requestedBy: REQUESTER,
        versionId: OLDER,
        release: 'local',
        failureKind: null,
        startedAt: expect.any(Date) as Date,
        finishedAt: expect.any(Date) as Date,
      }),
    ]);
  });

  it('job sem linha na fila (enfileirado antes dela existir): grava a tentativa e a fecha', async () => {
    const { result } = await run({ file: rollbackOk('exemplo-a', OLDER) }, 1, '9');
    await result;
    expect(await rollbackRows()).toEqual([
      expect.objectContaining({ jobId: '9', status: 'ok', versionId: OLDER, requestedBy: null }),
    ]);
  });

  it('não muda o estado nem a pausa do site', async () => {
    await db.transaction((tx) =>
      pauseSite(tx, 'exemplo-a', 'falhou', { origin: 'content', reference: '3' }),
    );
    const { result } = await run({ file: rollbackOk('exemplo-a', OLDER) });
    await result;
    expect(await site()).toMatchObject({
      activeVersionId: OLDER,
      state: 'pausado',
      pausedReason: 'falhou',
      pausedCulpritOrigin: 'content',
      pausedCulpritReference: '3',
    });
  });

  it.each<[string, FakeStage]>([
    ['ausente', { exitCode: 20 }],
    ['inválido', { file: { status: 'ok' } }],
    ['de outro site', { file: rollbackOk('exemplo-b', OLDER) }],
    ['com outra versão', { file: rollbackOk('exemplo-a', '20260901T000000Z-00000000') }],
    ['com falha transitória', { exitCode: 20, file: failedFile('transient', 'alvo fora') }],
  ])(
    'rollback.json %s: lança para o Graphile Worker repetir e não troca a versão',
    async (_, stage) => {
      const { fake, result, jobId } = await run(stage, 2);
      await expect(result).rejects.toBeInstanceOf(TransientBuildError);
      expect((await site())?.activeVersionId).toBe(CURRENT);
      expect(fake.removed).toHaveLength(1);
      expect(fake.volumes.removed).toHaveLength(1);
      // A tentativa fecha como falha e a repetição nasce na fila, com quem pediu e o destino.
      expect(await rollbackRows()).toEqual([
        expect.objectContaining({
          jobId,
          attempt: 2,
          status: 'failed',
          failedStage: null,
          failureKind: 'transient',
          failureMessage: expect.any(String) as string,
          versionId: OLDER,
          requestedBy: REQUESTER,
        }),
        expect.objectContaining({
          kind: 'rollback',
          jobId,
          attempt: 3,
          status: 'na_fila',
          versionId: OLDER,
          requestedBy: REQUESTER,
          scheduledFor: expect.any(Date) as Date,
          finishedAt: null,
        }),
      ]);
    },
  );

  it('falha transitória na última tentativa: fecha a linha sem nova na fila', async () => {
    const { result } = await run({ exitCode: 20, file: failedFile('transient', 'alvo fora') }, 5);
    await expect(result).rejects.toBeInstanceOf(TransientBuildError);
    expect((await rollbackRows()).map((r) => [r.attempt, r.status])).toEqual([[5, 'failed']]);
  });

  it('falha permanente: registra no log, encerra o job e não pausa o site', async () => {
    const { fake, result } = await run({
      exitCode: 10,
      file: failedFile('permanent', 'Versão não existe no alvo'),
    });
    await result;
    expect(errors).toEqual([expect.stringContaining('Versão não existe no alvo')]);
    expect(await site()).toMatchObject({ activeVersionId: CURRENT, state: 'ativo' });
    expect(await rollbackRows()).toEqual([
      expect.objectContaining({
        status: 'failed',
        failedStage: null,
        failureKind: 'permanent',
        failureMessage: 'Versão não existe no alvo',
        versionId: OLDER,
      }),
    ]);
    expect(fake.removed).toHaveLength(1);
    expect(fake.volumes.removed).toHaveLength(1);
  });

  it('a falha guarda a mensagem e as últimas linhas do log do container', async () => {
    const lines = Array.from({ length: 300 }, (_, i) => `linha ${i}`);
    const { result } = await run({
      exitCode: 10,
      file: failedFile('permanent', 'Versão não existe no alvo'),
      log: lines.join('\n'),
    });
    await result;
    const [row] = await rollbackRows();
    expect(row).toMatchObject({
      status: 'failed',
      failureKind: 'permanent',
      failureMessage: 'Versão não existe no alvo',
      currentStage: null,
      logTail: lines.slice(-200).join('\n'),
    });
  });

  it('falha ao ler o log não muda o resultado nem a classificação do rollback', async () => {
    const jobId = await queueRollback();
    const fake = fakeRuntime({
      rollback: { exitCode: 10, file: failedFile('permanent', 'Versão não existe no alvo') },
      failOn: 'logs',
    });
    await createRollbackTask({ db, runtime: fake.runtime, settings })(
      { siteId: 'exemplo-a', versionId: OLDER },
      helpers(jobId, 1),
    );
    expect(await rollbackRows()).toMatchObject([
      {
        status: 'failed',
        failureKind: 'permanent',
        failureMessage: 'Versão não existe no alvo',
        logTail: null,
      },
    ]);
  });

  it('site inexistente: ignora sem rodar container', async () => {
    const fake = fakeRuntime({});
    await createRollbackTask({ db, runtime: fake.runtime, settings })(
      { siteId: 'nao-existe', versionId: OLDER },
      helpers('9'),
    );
    expect(fake.started).toEqual([]);
    expect(await rollbackRows()).toEqual([]);
  });
});

describe('scheduleRollback', () => {
  it('grava um job rollback na fila build:<site>, a mesma do build', async () => {
    await db.transaction((tx) => scheduleRollback(tx, 'exemplo-a', OLDER, REQUESTER));
    // A view `jobs` não expõe o payload; a tabela privada sim. Criar o site agenda um build.
    const { rows } = await db.execute<{
      task_identifier: string;
      queue_name: string;
      payload: unknown;
      max_attempts: number;
    }>(sql`
      select t.identifier as task_identifier, q.queue_name, j.payload, j.max_attempts
      from graphile_worker._private_jobs j
      join graphile_worker._private_tasks t on t.id = j.task_id
      join graphile_worker._private_job_queues q on q.id = j.job_queue_id
      where t.identifier in ('build', 'rollback') order by t.identifier`);
    expect(rows).toEqual([
      expect.objectContaining({ task_identifier: 'build', queue_name: 'build:exemplo-a' }),
      {
        task_identifier: 'rollback',
        queue_name: 'build:exemplo-a',
        payload: { siteId: 'exemplo-a', versionId: OLDER },
        max_attempts: 5,
      },
    ]);
  });

  it('não substitui o build já agendado do site', async () => {
    await db.transaction((tx) => scheduleRollback(tx, 'exemplo-a', OLDER, REQUESTER));
    await db.transaction((tx) => scheduleRollback(tx, 'exemplo-a', CURRENT, REQUESTER));
    const { rows } = await db.execute<{ task_identifier: string }>(sql`
      select task_identifier from graphile_worker.jobs order by task_identifier`);
    expect(rows.map((r) => r.task_identifier)).toEqual(['build', 'rollback', 'rollback']);
  });
});

describe('reverter', () => {
  const operacao = { email: REQUESTER, roles: ['operacao'] as const };

  async function build(
    siteId: string,
    versionId: string | null,
    finishedAt: string,
    status: 'ok' | 'failed' = 'ok',
  ) {
    await db.insert(builds).values({
      siteId,
      release: 'local',
      attempt: 1,
      status,
      versionId,
      pages: 10,
      startedAt: new Date(finishedAt),
      finishedAt: new Date(finishedAt),
    });
  }

  async function rollbackJobs() {
    const { rows } = await db.execute<{ queue_name: string; payload: unknown }>(sql`
      select q.queue_name, j.payload
      from graphile_worker._private_jobs j
      join graphile_worker._private_tasks t on t.id = j.task_id
      join graphile_worker._private_job_queues q on q.id = j.job_queue_id
      where t.identifier = 'rollback'`);
    return rows;
  }

  beforeEach(async () => {
    await build('exemplo-a', OLDER, '2026-10-01T12:00:00Z');
    await build('exemplo-a', CURRENT, '2026-10-20T12:00:00Z');
  });

  it('lista as versões dos builds ok, da mais recente, sem a ativa nem falhas', async () => {
    const MIDDLE = '20261010T120000Z-bbbbbbbb';
    await build('exemplo-a', MIDDLE, '2026-10-10T12:00:00Z');
    // A mesma versão publicada de novo aparece uma vez, com a data mais recente.
    await build('exemplo-a', OLDER, '2026-10-02T12:00:00Z');
    await build('exemplo-a', null, '2026-10-21T12:00:00Z', 'failed');
    const listed = await listRollbackVersions(db, operacao, 'exemplo-a');
    expect(listed).toEqual({
      ok: true,
      value: [
        {
          versionId: MIDDLE,
          release: 'local',
          pages: 10,
          finishedAt: new Date('2026-10-10T12:00:00Z'),
        },
        {
          versionId: OLDER,
          release: 'local',
          pages: 10,
          finishedAt: new Date('2026-10-02T12:00:00Z'),
        },
      ],
    });
  });

  it('enfileira o rollback na fila build:<site> sem mudar estado nem pausa', async () => {
    await db.transaction((tx) => pauseSite(tx, 'exemplo-a', 'falhou'));
    expect(await db.transaction((tx) => requestRollback(tx, operacao, 'exemplo-a', OLDER))).toEqual(
      { ok: true, value: undefined },
    );
    expect(await rollbackJobs()).toEqual([
      { queue_name: 'build:exemplo-a', payload: { siteId: 'exemplo-a', versionId: OLDER } },
    ]);
    expect(await site()).toMatchObject({
      activeVersionId: CURRENT,
      state: 'pausado',
      pausedReason: 'falhou',
    });
  });

  it('o pedido grava a linha rollback na fila, com quem pediu e a versão de destino', async () => {
    await db.transaction((tx) => requestRollback(tx, operacao, 'exemplo-a', OLDER));
    const { rows: jobs } = await db.execute<{ id: string }>(sql`
      select id::text from graphile_worker.jobs where task_identifier = 'rollback'`);
    expect(await rollbackRows()).toEqual([
      expect.objectContaining({
        siteId: 'exemplo-a',
        kind: 'rollback',
        jobId: jobs[0]?.id,
        attempt: 1,
        status: 'na_fila',
        requestedBy: REQUESTER,
        versionId: OLDER,
        scheduledFor: expect.any(Date) as Date,
        release: null,
        startedAt: null,
        finishedAt: null,
      }),
    ]);
  });

  it('linhas de rollback não contam como build: versões, referência da trava e último build', async () => {
    const MIDDLE = '20261010T120000Z-bbbbbbbb';
    // Rollbacks mais novos que todo build: um ok para uma versão nunca publicada por build e
    // um ok para OLDER, com páginas que nenhum build teve; e um que falhou.
    for (const [versionId, status] of [
      [MIDDLE, 'ok'],
      [OLDER, 'ok'],
      [OLDER, 'failed'],
    ] as const) {
      await db.insert(builds).values({
        siteId: 'exemplo-a',
        kind: 'rollback',
        release: 'local',
        attempt: 1,
        status,
        versionId,
        pages: 99,
        startedAt: new Date('2026-10-25T12:00:00Z'),
        finishedAt: new Date('2026-10-25T12:00:00Z'),
      });
    }
    expect(await listRollbackVersions(db, operacao, 'exemplo-a')).toEqual({
      ok: true,
      value: [
        {
          versionId: OLDER,
          release: 'local',
          pages: 10,
          finishedAt: new Date('2026-10-01T12:00:00Z'),
        },
      ],
    });
    expect(await activeBuild(db, 'exemplo-a', OLDER)).toEqual({ pages: 10, files: null });
    expect(await activeBuild(db, 'exemplo-a', MIDDLE)).toBeUndefined();
    expect((await lastBuilds(db)).get('exemplo-a')).toEqual({
      status: 'ok',
      versionId: CURRENT,
      finishedAt: new Date('2026-10-20T12:00:00Z'),
    });
    expect((await recentBuilds(db, 'exemplo-a')).map((b) => b.versionId)).toEqual([CURRENT, OLDER]);
  });

  it.each([
    ['a versão ativa', CURRENT, 'rollback.version_active'],
    ['versão de build com falha', 'falhou-1', 'rollback.version_unknown'],
    ['versão de outro site', 'outro-1', 'rollback.version_unknown'],
    ['versão inexistente', '20260101T000000Z-00000000', 'rollback.version_unknown'],
  ])('recusa %s, sem enfileirar', async (_, versionId, code) => {
    await build('exemplo-a', 'falhou-1', '2026-10-05T12:00:00Z', 'failed');
    const line = (await readFixture('exemplo-b')).find((l) => l.type === 'config');
    if (line?.type !== 'config') throw new Error('fixture sem config');
    await db.transaction((tx) => createSite(tx, SYSTEM_ACTOR, line.data));
    await build('exemplo-b', 'outro-1', '2026-10-05T12:00:00Z');
    expect(
      await db.transaction((tx) => requestRollback(tx, operacao, 'exemplo-a', versionId)),
    ).toMatchObject({ ok: false, issues: [{ code, path: ['versionId'] }] });
    expect(await rollbackJobs()).toEqual([]);
  });

  it('recusa site inexistente', async () => {
    expect(
      await db.transaction((tx) => requestRollback(tx, operacao, 'nao-existe', OLDER)),
    ).toMatchObject({ ok: false, issues: [{ code: 'site.not_found' }] });
    expect(await listRollbackVersions(db, operacao, 'nao-existe')).toMatchObject({
      ok: false,
      issues: [{ code: 'site.not_found' }],
    });
  });

  it('editor e revisor recebem forbidden e nada é enfileirado', async () => {
    for (const role of ['editor', 'revisor'] as const) {
      const actor = { email: `${role}@orakel.local`, roles: [role] };
      expect(
        await db.transaction((tx) => requestRollback(tx, actor, 'exemplo-a', OLDER)),
      ).toMatchObject({ ok: false, issues: [{ code: 'forbidden' }] });
      expect(await listRollbackVersions(db, actor, 'exemplo-a')).toMatchObject({
        ok: false,
        issues: [{ code: 'forbidden' }],
      });
    }
    expect(await rollbackJobs()).toEqual([]);
  });

  describe('desfazer última publicação', () => {
    // O beforeEach de cima publica OLDER (A) e depois CURRENT (B); B está no ar.
    const older = {
      versionId: OLDER,
      release: 'local',
      pages: 10,
      finishedAt: new Date('2026-10-01T12:00:00Z'),
    };

    it('com A e depois B no ar, enfileira o rollback para A em nome de quem pediu', async () => {
      expect(await previousVersion(db, operacao, 'exemplo-a')).toEqual({ ok: true, value: older });
      expect(
        await db.transaction((tx) => requestUndoLastPublish(tx, operacao, 'exemplo-a')),
      ).toEqual({ ok: true, value: older });
      expect(await rollbackJobs()).toEqual([
        { queue_name: 'build:exemplo-a', payload: { siteId: 'exemplo-a', versionId: OLDER } },
      ]);
      expect(await rollbackRows()).toEqual([
        expect.objectContaining({
          kind: 'rollback',
          status: 'na_fila',
          versionId: OLDER,
          requestedBy: REQUESTER,
        }),
      ]);
    });

    it('depois do rollback de B para A, a anterior é B, nunca a própria A', async () => {
      await db.transaction((tx) => requestUndoLastPublish(tx, operacao, 'exemplo-a'));
      const { rows } = await db.execute<{ id: string }>(sql`
        select id::text from graphile_worker.jobs where task_identifier = 'rollback'`);
      const fake = fakeRuntime({ rollback: { file: rollbackOk('exemplo-a', OLDER) } });
      await createRollbackTask({ db, runtime: fake.runtime, settings })(
        { siteId: 'exemplo-a', versionId: OLDER },
        helpers(rows[0]?.id ?? ''),
      );
      expect((await site())?.activeVersionId).toBe(OLDER);

      const previous = await previousVersion(db, operacao, 'exemplo-a');
      expect(previous).toEqual({
        ok: true,
        value: {
          versionId: CURRENT,
          release: 'local',
          pages: 10,
          finishedAt: new Date('2026-10-20T12:00:00Z'),
        },
      });
      expect(previous.ok && previous.value?.versionId).not.toBe(OLDER);
    });

    it('a anterior segue a ordem das idas ao ar, contando os rollbacks, e não a dos builds', async () => {
      // Builds A, M e B; depois rollback para A e rollback para M: M no ar. Pela ordem dos
      // builds a anterior seria B; pela das idas ao ar é A, que saiu do ar quando M voltou.
      const MIDDLE = '20261010T120000Z-bbbbbbbb';
      await build('exemplo-a', MIDDLE, '2026-10-10T12:00:00Z');
      for (const [versionId, at] of [
        [OLDER, '2026-10-25T12:00:00Z'],
        [MIDDLE, '2026-10-26T12:00:00Z'],
      ] as const) {
        await db.insert(builds).values({
          siteId: 'exemplo-a',
          kind: 'rollback',
          release: 'local',
          attempt: 1,
          status: 'ok',
          versionId,
          startedAt: new Date(at),
          finishedAt: new Date(at),
        });
      }
      await db.transaction((tx) => setActiveVersion(tx, 'exemplo-a', MIDDLE));
      expect(await previousVersion(db, operacao, 'exemplo-a')).toEqual({ ok: true, value: older });
    });

    it.each([
      ['só com a versão ativa publicada', true],
      ['nunca publicado', false],
    ])('site %s recusa com rollback.no_previous e não enfileira', async (_, published) => {
      await db.delete(builds);
      if (published) await build('exemplo-a', CURRENT, '2026-10-20T12:00:00Z');
      else await db.update(sites).set({ activeVersionId: null }).where(eq(sites.id, 'exemplo-a'));
      expect(await previousVersion(db, operacao, 'exemplo-a')).toEqual({ ok: true, value: null });
      expect(
        await db.transaction((tx) => requestUndoLastPublish(tx, operacao, 'exemplo-a')),
      ).toMatchObject({ ok: false, issues: [{ code: 'rollback.no_previous' }] });
      expect(await rollbackJobs()).toEqual([]);
      expect(await rollbackRows()).toEqual([]);
    });

    it('recusa site inexistente', async () => {
      expect(await previousVersion(db, operacao, 'nao-existe')).toMatchObject({
        ok: false,
        issues: [{ code: 'site.not_found' }],
      });
      expect(
        await db.transaction((tx) => requestUndoLastPublish(tx, operacao, 'nao-existe')),
      ).toMatchObject({ ok: false, issues: [{ code: 'site.not_found' }] });
    });

    it('sem operations.run, a leitura e o pedido são recusados e nada é enfileirado', async () => {
      for (const role of ['editor', 'revisor'] as const) {
        const actor = { email: `${role}@orakel.local`, roles: [role] };
        expect(await previousVersion(db, actor, 'exemplo-a')).toMatchObject({
          ok: false,
          issues: [{ code: 'forbidden' }],
        });
        expect(
          await db.transaction((tx) => requestUndoLastPublish(tx, actor, 'exemplo-a')),
        ).toMatchObject({ ok: false, issues: [{ code: 'forbidden' }] });
      }
      expect(await rollbackJobs()).toEqual([]);
    });
  });
});
