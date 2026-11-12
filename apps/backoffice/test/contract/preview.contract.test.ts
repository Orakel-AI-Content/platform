import { sql } from 'drizzle-orm';
import type { JobHelpers } from 'graphile-worker';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { readFixture } from '../../src/bin/seed.ts';
import type { Db } from '../../src/db/client.ts';
import { builds, previewState, type BuildStatus } from '../../src/db/schema/index.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
import {
  failedFile,
  fakeRuntime,
  publishOk,
  renderOk,
} from '../../src/domain/builds/fake-runtime.ts';
import type { BuildSettings } from '../../src/domain/builds/plan.ts';
import {
  completePreviewUpdate,
  currentPreviewRelease,
  failPreviewUpdate,
  markPreviewWithoutVersion,
  readPreviewState,
  RECONCILE_PREVIEW_TASK,
  schedulePreviewReconcile,
  startPreviewUpdate,
} from '../../src/domain/preview/preview.ts';
import { createSite } from '../../src/domain/sites/sites.ts';
import { createBuildTask } from '../../src/jobs/tasks/build.ts';
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
  await db.execute(sql`delete from graphile_worker._private_jobs`);
});

/** Grava uma execução fechada do site, sem passar pela task. */
async function finished(
  release: string,
  status: Exclude<BuildStatus, 'na_fila' | 'rodando'>,
  kind: 'build' | 'rollback' = 'build',
): Promise<void> {
  const at = new Date();
  await db.insert(builds).values({
    siteId: 'exemplo-a',
    release,
    kind,
    attempt: 1,
    status,
    startedAt: at,
    finishedAt: at,
  });
}

/** Jobs de reconciliação da prévia na fila, com a chave. */
async function reconcileJobs() {
  const { rows } = await db.execute<{ key: string | null; queue_name: string | null }>(
    sql`select key, queue_name from graphile_worker.jobs
        where task_identifier = ${RECONCILE_PREVIEW_TASK}`,
  );
  return rows;
}

function helpers(): JobHelpers {
  return {
    logger: silent,
    job: { id: '7', attempts: 1, max_attempts: 5, run_at: new Date() },
  } as unknown as JobHelpers;
}

describe('versão corrente da prévia', () => {
  it('é a maior release com build ok, em ordem numérica', async () => {
    await finished('1.2.0', 'ok');
    await finished('1.10.0', 'ok');
    await finished('1.9.0', 'ok');
    expect(await currentPreviewRelease(db)).toBe('1.10.0');
  });

  it('ignora build falho ou cancelado numa release maior', async () => {
    await finished('1.2.0', 'ok');
    await finished('2.0.0', 'failed');
    await finished('3.0.0', 'cancelado');
    expect(await currentPreviewRelease(db)).toBe('1.2.0');
  });

  it('ignora rollback e tags fora do formato X.Y.Z', async () => {
    await finished('1.2.0', 'ok');
    await finished('4.0.0', 'ok', 'rollback');
    await finished('local', 'ok');
    expect(await currentPreviewRelease(db)).toBe('1.2.0');
  });

  it('é nula sem nenhum build ok', async () => {
    expect(await currentPreviewRelease(db)).toBeNull();
    await finished('1.2.0', 'failed');
    expect(await currentPreviewRelease(db)).toBeNull();
  });
});

describe('reconciliação ao fim do build', () => {
  it('o build ok enfileira reconcile-preview com a chave única', async () => {
    const fake = fakeRuntime({ render: { file: renderOk() }, publish: { file: publishOk() } });
    await createBuildTask({ db, runtime: fake.runtime, settings })(
      { siteId: 'exemplo-a' },
      helpers(),
    );
    expect(await reconcileJobs()).toEqual([{ key: 'preview', queue_name: 'preview' }]);
  });

  it('pedidos repetidos viram um job só', async () => {
    await schedulePreviewReconcile(db);
    await schedulePreviewReconcile(db);
    const fake = fakeRuntime({ render: { file: renderOk() }, publish: { file: publishOk() } });
    await createBuildTask({ db, runtime: fake.runtime, settings })(
      { siteId: 'exemplo-a' },
      helpers(),
    );
    expect(await reconcileJobs()).toEqual([{ key: 'preview', queue_name: 'preview' }]);
  });

  it('build falho não enfileira', async () => {
    const fake = fakeRuntime({
      render: { exitCode: 10, file: failedFile('permanent', 'conteúdo inválido') },
    });
    await createBuildTask({ db, runtime: fake.runtime, settings })(
      { siteId: 'exemplo-a' },
      helpers(),
    );
    expect(await reconcileJobs()).toEqual([]);
  });
});

describe('estado da prévia', () => {
  it('sem linha gravada, é sem_versao', async () => {
    expect(await readPreviewState(db)).toEqual({
      status: 'sem_versao',
      currentRelease: null,
      targetRelease: null,
      failureReason: null,
      updatedAt: null,
    });
  });

  it('atualizando → no_ar põe a versão alvo no ar', async () => {
    await startPreviewUpdate(db, '1.2.0');
    expect(await readPreviewState(db)).toMatchObject({
      status: 'atualizando',
      currentRelease: null,
      targetRelease: '1.2.0',
    });
    expect(await completePreviewUpdate(db, '1.2.0')).toBe(true);
    expect(await readPreviewState(db)).toMatchObject({
      status: 'no_ar',
      currentRelease: '1.2.0',
      targetRelease: null,
      failureReason: null,
    });
  });

  it('atualizando → falhou mantém a versão no ar e guarda o motivo', async () => {
    await startPreviewUpdate(db, '1.2.0');
    await completePreviewUpdate(db, '1.2.0');
    await startPreviewUpdate(db, '1.3.0');
    expect(await failPreviewUpdate(db, '1.3.0', 'healthcheck falhou')).toBe(true);
    expect(await readPreviewState(db)).toMatchObject({
      status: 'falhou',
      currentRelease: '1.2.0',
      targetRelease: '1.3.0',
      failureReason: 'healthcheck falhou',
    });
    // Nova tentativa limpa o motivo.
    await startPreviewUpdate(db, '1.3.0');
    expect(await readPreviewState(db)).toMatchObject({
      status: 'atualizando',
      currentRelease: '1.2.0',
      failureReason: null,
    });
  });

  it('recusa concluir ou falhar fora de atualizando ou para outro alvo', async () => {
    expect(await completePreviewUpdate(db, '1.2.0')).toBe(false);
    await startPreviewUpdate(db, '1.3.0');
    expect(await completePreviewUpdate(db, '1.2.0')).toBe(false);
    expect(await failPreviewUpdate(db, '1.2.0', 'x')).toBe(false);
    await completePreviewUpdate(db, '1.3.0');
    expect(await failPreviewUpdate(db, '1.3.0', 'x')).toBe(false);
    expect(await readPreviewState(db)).toMatchObject({ status: 'no_ar', currentRelease: '1.3.0' });
  });

  it('sem_versao limpa as versões', async () => {
    await startPreviewUpdate(db, '1.2.0');
    await completePreviewUpdate(db, '1.2.0');
    await markPreviewWithoutVersion(db);
    expect(await readPreviewState(db)).toMatchObject({
      status: 'sem_versao',
      currentRelease: null,
      targetRelease: null,
    });
  });

  it('existe uma linha só', async () => {
    await startPreviewUpdate(db, '1.2.0');
    await completePreviewUpdate(db, '1.2.0');
    await startPreviewUpdate(db, '1.3.0');
    await markPreviewWithoutVersion(db);
    expect(await db.select().from(previewState)).toHaveLength(1);
    const second = async () => {
      await db.insert(previewState).values({ id: 'outra', status: 'sem_versao' });
    };
    await expect(second()).rejects.toThrow();
  });
});
