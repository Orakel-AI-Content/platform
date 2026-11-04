import { eq, sql } from 'drizzle-orm';
import type { JobHelpers } from 'graphile-worker';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import { sites } from '../../src/db/schema/index.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
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
const helpers = (attempts = 1) => ({ logger, job: { id: '9', attempts } }) as unknown as JobHelpers;

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

function run(rollback: FakeStage, attempts = 1) {
  const fake = fakeRuntime({ rollback });
  const result = createRollbackTask({ db, runtime: fake.runtime, settings })(
    { siteId: 'exemplo-a', versionId: OLDER },
    helpers(attempts),
  );
  return { fake, result };
}

describe('task rollback', () => {
  it('sucesso: roda o container rollback com a versão pedida e ela passa a ser a ativa', async () => {
    const { fake, result } = run({ file: rollbackOk('exemplo-a', OLDER) });
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

  it('não muda o estado nem a pausa do site', async () => {
    await db.transaction((tx) =>
      pauseSite(tx, 'exemplo-a', 'falhou', { origin: 'content', reference: '3' }),
    );
    const { result } = run({ file: rollbackOk('exemplo-a', OLDER) });
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
      const { fake, result } = run(stage, 2);
      await expect(result).rejects.toBeInstanceOf(TransientBuildError);
      expect((await site())?.activeVersionId).toBe(CURRENT);
      expect(fake.removed).toHaveLength(1);
      expect(fake.volumes.removed).toHaveLength(1);
    },
  );

  it('falha permanente: registra no log, encerra o job e não pausa o site', async () => {
    const { fake, result } = run({
      exitCode: 10,
      file: failedFile('permanent', 'Versão não existe no alvo'),
    });
    await result;
    expect(errors).toEqual([expect.stringContaining('Versão não existe no alvo')]);
    expect(await site()).toMatchObject({ activeVersionId: CURRENT, state: 'ativo' });
    expect(fake.removed).toHaveLength(1);
    expect(fake.volumes.removed).toHaveLength(1);
  });

  it('site inexistente: ignora sem rodar container', async () => {
    const fake = fakeRuntime({});
    await createRollbackTask({ db, runtime: fake.runtime, settings })(
      { siteId: 'nao-existe', versionId: OLDER },
      helpers(),
    );
    expect(fake.started).toEqual([]);
  });
});

describe('scheduleRollback', () => {
  it('grava um job rollback na fila build:<site>, a mesma do build', async () => {
    await db.transaction((tx) => scheduleRollback(tx, 'exemplo-a', OLDER));
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
    await db.transaction((tx) => scheduleRollback(tx, 'exemplo-a', OLDER));
    await db.transaction((tx) => scheduleRollback(tx, 'exemplo-a', CURRENT));
    const { rows } = await db.execute<{ task_identifier: string }>(sql`
      select task_identifier from graphile_worker.jobs order by task_identifier`);
    expect(rows.map((r) => r.task_identifier)).toEqual(['build', 'rollback', 'rollback']);
  });
});
