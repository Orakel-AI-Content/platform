import { eq, sql } from 'drizzle-orm';
import type { JobHelpers, Task } from 'graphile-worker';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import { infraRuns, sites, type InfraStep } from '../../src/db/schema/index.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { SYSTEM_ACTOR, type Actor } from '../../src/domain/access/rbac.ts';
import { upsertUser } from '../../src/domain/access/users.ts';
import {
  fakeRuntime,
  infraDestroyed,
  infraDestroyPlanOk,
} from '../../src/domain/builds/fake-runtime.ts';
import { localDriver, tofuDriver, type InfraDriver } from '../../src/domain/infra/drivers.ts';
import { confirmInfraRemovalPlan, requestInfraRemovalPlan } from '../../src/domain/infra/plan.ts';
import { requestInfraRemoval } from '../../src/domain/infra/runs.ts';
import {
  BUILD_RUNNER_INFRA_RECOVERY,
  INFRA_APPLY_TASK,
  INFRA_PLAN_TASK,
  INFRA_REMOVE_WORKER_TASK,
  INTERRUPTED_INFRA_MESSAGE,
  INTERRUPTED_WORKER_INFRA_MESSAGE,
  recoverInterruptedInfraRuns,
  WORKER_INFRA_RECOVERY,
} from '../../src/domain/infra/schedule.ts';
import { memoryStore, ORIGINALS_BUCKET, type ObjectStore } from '../../src/domain/media/store.ts';
import { EMPTY_SITE_MEDIA_TASK } from '../../src/domain/media/variants.ts';
import { createSite } from '../../src/domain/sites/sites.ts';
import { buildRunnerTasks, workerTasks } from '../../src/jobs/task-lists.ts';
import { createEmptySiteMediaTask } from '../../src/jobs/tasks/empty-site-media.ts';
import { createInfraApplyTask } from '../../src/jobs/tasks/infra-apply.ts';
import { createInfraPlanTask } from '../../src/jobs/tasks/infra-plan.ts';
import { createInfraRemoveWorkerTask } from '../../src/jobs/tasks/infra-remove-worker.ts';
import type { WorkerRemoval, WorkerRemover } from '../../src/lib/cloudflare.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

// Cadeia da remoção da infra (workspace#97): confirmação → Worker (build-runner) → esvaziamento
// (backoffice-worker) → destroy (build-runner), na fila infra:<site>, cada elo enfileirando o
// próximo. A fila é drenada aqui como os dois processos a drenariam, um job por vez.

let db: Db;
let close: () => Promise<void>;

const admin: Actor = { email: 'adm@orakel.local', roles: ['admin'] };
const SITE = 'exemplo-a';
const QUEUE = `infra:${SITE}`;
const BUCKET = `media-${SITE}`;
let domain = '';

const logger = { debug() {}, info() {}, warn() {}, error() {} };
const helpers = { logger, job: { id: '1', attempts: 1, max_attempts: 1 } } as unknown as JobHelpers;

/** Worker do site no alvo de deploy: existe até ser removido; `fail` força a falha. */
function fakeWorkers(options: { fail?: boolean } = {}) {
  const state = { exists: true, fail: options.fail ?? false, calls: 0 };
  const remover: WorkerRemover = {
    remove(site): Promise<WorkerRemoval> {
      state.calls += 1;
      if (site !== SITE) throw new Error(`site inesperado: ${site}`);
      if (state.fail) {
        return Promise.resolve({
          kind: 'falha',
          message: 'Cloudflare respondeu 400',
          transient: false,
        });
      }
      const existed = state.exists;
      state.exists = false;
      return Promise.resolve({ kind: existed ? 'removido' : 'inexistente' });
    },
  };
  return { remover, state };
}

const bytes = new Uint8Array([1]);
async function fillMedia(store: ObjectStore) {
  await store.put(BUCKET, 'img/a.webp', bytes, 1, 'image/webp');
  await store.put(BUCKET, 'img/b.webp', bytes, 1, 'image/webp');
  await store.put(ORIGINALS_BUCKET, `${SITE}/foto.jpg`, bytes, 1, 'image/jpeg');
}

type Chain = { workers: WorkerRemover; store: ObjectStore; infra: InfraDriver };

function chainTasks({ workers, store, infra }: Chain): Record<string, Task> {
  return {
    [INFRA_REMOVE_WORKER_TASK]: createInfraRemoveWorkerTask({ db, workers }),
    [EMPTY_SITE_MEDIA_TASK]: createEmptySiteMediaTask({ db, store }),
    [INFRA_APPLY_TASK]: createInfraApplyTask({ db, infra }),
  };
}

async function queued() {
  const { rows } = await db.execute<{ id: string; task: string; payload: unknown }>(sql`
    select j.id::text, t.identifier as task, j.payload
    from graphile_worker._private_jobs j
    join graphile_worker._private_tasks t on t.id = j.task_id
    join graphile_worker._private_job_queues q on q.id = j.job_queue_id
    where q.queue_name = ${QUEUE}
    order by j.id`);
  return rows;
}

/** Roda os jobs da fila na ordem, como os processos fariam, e devolve as tasks rodadas. */
async function drain(chain: Chain): Promise<string[]> {
  const tasks = chainTasks(chain);
  const ran: string[] = [];
  for (let guard = 0; guard < 10; guard += 1) {
    const [job] = await queued();
    if (job === undefined) return ran;
    const task = tasks[job.task];
    if (task === undefined) throw new Error(`task fora da cadeia na fila: ${job.task}`);
    await db.execute(sql`delete from graphile_worker._private_jobs where id = ${job.id}::bigint`);
    await task(job.payload, helpers);
    ran.push(job.task);
  }
  throw new Error('a cadeia não terminou');
}

async function requestRemoval(infra: InfraDriver): Promise<number> {
  const result = await db.transaction((tx) => requestInfraRemoval(tx, admin, SITE));
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  const runId = result.value.id;
  await createInfraPlanTask({ db, infra })({ siteId: SITE, runId }, helpers);
  return runId;
}

async function confirm(runId: number, typed = domain) {
  return db.transaction((tx) => confirmInfraRemovalPlan(tx, admin, SITE, runId, typed));
}

async function confirmed(runId: number): Promise<void> {
  const result = await confirm(runId);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
}

async function run(runId: number) {
  const [row] = await db.select().from(infraRuns).where(eq(infraRuns.id, runId));
  return row;
}

async function lifecycle() {
  const [row] = await db
    .select({ lifecycle: sites.lifecycle })
    .from(sites)
    .where(eq(sites.id, SITE));
  return row?.lifecycle;
}

beforeAll(async () => {
  ({ db, close } = await setupDatabase());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDatabase(db);
  const line = (await readFixture(SITE)).find((l) => l.type === 'config');
  if (line?.type !== 'config') throw new Error('fixture sem config');
  domain = line.data.domains[0] ?? '';
  await db.transaction((tx) => createSite(tx, SYSTEM_ACTOR, line.data));
  await upsertUser(db, { email: admin.email, name: admin.email, roles: admin.roles });
  await db
    .update(sites)
    .set({ lifecycle: 'publicado', state: 'pausado', pausedReason: 'remoção da infra' })
    .where(eq(sites.id, SITE));
  // O cadastro do site enfileira o build dele; a cadeia só olha a fila infra:<site>.
});

describe('pedido', () => {
  const operacao: Actor = { email: 'opa@orakel.local', roles: ['operacao'] };

  it('grava a remoção planejando e enfileira o plano na mesma transação', async () => {
    const result = await db.transaction((tx) => requestInfraRemovalPlan(tx, admin, SITE));
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(await run(result.value.runId)).toMatchObject({ tipo: 'remover', status: 'planejando' });
    expect((await queued()).map((job) => job.task)).toEqual([INFRA_PLAN_TASK]);
  });

  it('recusado (sem site.destroy ou com o site ativo), nada é enfileirado', async () => {
    const denied = await db.transaction((tx) => requestInfraRemovalPlan(tx, operacao, SITE));
    expect(denied.ok).toBe(false);
    await db.update(sites).set({ state: 'ativo', pausedReason: null }).where(eq(sites.id, SITE));
    const active = await db.transaction((tx) => requestInfraRemovalPlan(tx, admin, SITE));
    expect(active.ok).toBe(false);
    expect(await queued()).toEqual([]);
    expect(await db.select().from(infraRuns)).toEqual([]);
  });

  it('com uma execução aberta, não enfileira outro plano', async () => {
    await db.transaction((tx) => requestInfraRemovalPlan(tx, admin, SITE));
    const again = await db.transaction((tx) => requestInfraRemovalPlan(tx, admin, SITE));
    expect(again.ok).toBe(false);
    expect((await queued()).map((job) => job.task)).toEqual([INFRA_PLAN_TASK]);
  });
});

describe('confirmação', () => {
  it('enfileira o elo do Worker na fila infra:<site>, numa tentativa só', async () => {
    const runId = await requestRemoval(localDriver());
    await confirmed(runId);

    const { rows } = await db.execute<{ task_identifier: string; max_attempts: number }>(sql`
      select task_identifier, max_attempts from graphile_worker.jobs where queue_name = ${QUEUE}`);
    expect(rows).toEqual([{ task_identifier: INFRA_REMOVE_WORKER_TASK, max_attempts: 1 }]);
    expect((await run(runId))?.status).toBe('aplicando');
  });

  it('recusada (domínio errado), nada é enfileirado', async () => {
    const runId = await requestRemoval(localDriver());
    const result = await confirm(runId, `x${domain}`);

    expect(result.ok).toBe(false);
    expect(await queued()).toEqual([]);
    expect((await run(runId))?.status).toBe('aguardando_confirmacao');
  });
});

describe('cadeia', () => {
  it('roda Worker → esvaziamento → destroy e fecha ok com o site em cadastrado', async () => {
    const workers = fakeWorkers();
    const store = memoryStore();
    await fillMedia(store);
    const infra = localDriver();
    const runId = await requestRemoval(infra);
    await confirmed(runId);

    const ran = await drain({ workers: workers.remover, store, infra });

    expect(ran).toEqual([INFRA_REMOVE_WORKER_TASK, EMPTY_SITE_MEDIA_TASK, INFRA_APPLY_TASK]);
    expect(workers.state.exists).toBe(false);
    expect(await store.list(BUCKET)).toEqual([]);
    expect(await store.list(ORIGINALS_BUCKET)).toEqual([`${SITE}/foto.jpg`]);
    expect(await run(runId)).toMatchObject({ status: 'ok', currentStep: null, failedStep: null });
    expect(await lifecycle()).toBe('cadastrado');
  });

  it('cada elo grava a etapa dele antes de enfileirar o próximo', async () => {
    const store = memoryStore();
    const infra = localDriver();
    const runId = await requestRemoval(infra);
    await confirmed(runId);
    const steps: (InfraStep | null | undefined)[] = [];
    const watched: WorkerRemover = {
      async remove(site) {
        steps.push((await run(runId))?.currentStep);
        return fakeWorkers().remover.remove(site);
      },
    };
    const watchedStore: ObjectStore = {
      ...store,
      list: async (bucket, prefix) => {
        steps.push((await run(runId))?.currentStep);
        return store.list(bucket, prefix);
      },
    };

    await drain({ workers: watched, store: watchedStore, infra });

    // A listagem roda duas vezes (antes e depois da remoção), as duas em `imagens`.
    expect(steps).toEqual(['paginas', 'imagens', 'imagens']);
  });

  it('falha no Worker fecha em paginas e não roda os elos seguintes', async () => {
    const workers = fakeWorkers({ fail: true });
    const store = memoryStore();
    await fillMedia(store);
    const runId = await requestRemoval(localDriver());
    await confirmed(runId);

    const ran = await drain({ workers: workers.remover, store, infra: localDriver() });

    expect(ran).toEqual([INFRA_REMOVE_WORKER_TASK]);
    expect(await run(runId)).toMatchObject({
      status: 'falhou',
      failedStep: 'paginas',
      failureMessage: 'Cloudflare respondeu 400',
    });
    expect(await store.list(BUCKET)).toHaveLength(2);
    expect(await lifecycle()).toBe('publicado');
  });

  it('falha no esvaziamento fecha em imagens e não roda o destroy', async () => {
    const store = memoryStore();
    await fillMedia(store);
    const stuck: ObjectStore = { ...store, deleteMany: () => Promise.resolve() };
    const runId = await requestRemoval(localDriver());
    await confirmed(runId);

    const ran = await drain({ workers: fakeWorkers().remover, store: stuck, infra: localDriver() });

    expect(ran).toEqual([INFRA_REMOVE_WORKER_TASK, EMPTY_SITE_MEDIA_TASK]);
    expect(await run(runId)).toMatchObject({
      status: 'falhou',
      failedStep: 'imagens',
      failureMessage: `${BUCKET} ainda tem 2 objetos depois do esvaziamento`,
    });
    expect(await lifecycle()).toBe('publicado');
  });

  it('erro inesperado do armazenamento também fecha em imagens', async () => {
    const broken: ObjectStore = {
      ...memoryStore(),
      list: () => Promise.reject(new Error('S3 fora do ar')),
    };
    const runId = await requestRemoval(localDriver());
    await confirmed(runId);

    await drain({ workers: fakeWorkers().remover, store: broken, infra: localDriver() });

    expect(await run(runId)).toMatchObject({ status: 'falhou', failedStep: 'imagens' });
    expect((await run(runId))?.failureMessage).toContain('S3 fora do ar');
  });

  it('falha no destroy fecha com a etapa do apply, depois dos dois elos', async () => {
    const infra = localDriver({ failStep: 'dns' });
    const runId = await requestRemoval(infra);
    await confirmed(runId);

    const ran = await drain({ workers: fakeWorkers().remover, store: memoryStore(), infra });

    expect(ran).toEqual([INFRA_REMOVE_WORKER_TASK, EMPTY_SITE_MEDIA_TASK, INFRA_APPLY_TASK]);
    expect(await run(runId)).toMatchObject({ status: 'falhou', failedStep: 'dns' });
    expect(await lifecycle()).toBe('publicado');
  });

  it('uma nova execução depois da falha conclui sem erro sobre o que já foi removido', async () => {
    const workers = fakeWorkers();
    const store = memoryStore();
    await fillMedia(store);
    const infra = localDriver({ failStep: 'dns' });
    const first = await requestRemoval(infra);
    await confirmed(first);
    await drain({ workers: workers.remover, store, infra });
    expect(await run(first)).toMatchObject({ status: 'falhou', failedStep: 'dns' });

    const retry = await requestRemoval(infra);
    await confirmed(retry);
    const ran = await drain({ workers: workers.remover, store, infra });

    expect(ran).toEqual([INFRA_REMOVE_WORKER_TASK, EMPTY_SITE_MEDIA_TASK, INFRA_APPLY_TASK]);
    // O Worker e o bucket já não existiam: os elos contam como sucesso.
    expect(workers.state.calls).toBe(2);
    expect(await run(retry)).toMatchObject({ status: 'ok', failedStep: null });
    expect(await lifecycle()).toBe('cadastrado');
  });

  it('elo de uma execução que já não aplica é ignorado sem tocar em nada', async () => {
    const workers = fakeWorkers();
    const runId = await requestRemoval(localDriver());
    await confirmed(runId);
    await db
      .update(infraRuns)
      .set({ status: 'falhou', finishedAt: new Date() })
      .where(eq(infraRuns.id, runId));

    const ran = await drain({
      workers: workers.remover,
      store: memoryStore(),
      infra: localDriver(),
    });

    expect(ran).toEqual([INFRA_REMOVE_WORKER_TASK]);
    expect(workers.state.calls).toBe(0);
  });
});

describe('recuperação na partida', () => {
  /** Trava o job da task como se o processo `owner` o tivesse pegado. */
  async function lock(task: string, owner: string) {
    await db.execute(sql`
      update graphile_worker._private_jobs set locked_by = ${owner}, locked_at = now(),
        attempts = attempts + 1
      where task_id = (select id from graphile_worker._private_tasks where identifier = ${task})`);
    await db.execute(sql`
      update graphile_worker._private_job_queues set locked_by = ${owner}, locked_at = now()
      where queue_name = ${QUEUE}`);
  }

  async function locks() {
    const { rows } = await db.execute<{ locked_by: string | null }>(sql`
      select locked_by from graphile_worker._private_job_queues where queue_name = ${QUEUE}
      union all
      select locked_by from graphile_worker.jobs where queue_name = ${QUEUE}`);
    return rows.map((row) => row.locked_by);
  }

  it('o build-runner fecha a remoção largada no elo do Worker, em paginas', async () => {
    const runId = await requestRemoval(localDriver());
    await confirmed(runId);
    await db.update(infraRuns).set({ currentStep: 'paginas' }).where(eq(infraRuns.id, runId));
    await lock(INFRA_REMOVE_WORKER_TASK, 'runner-morto');

    const recovered = await recoverInterruptedInfraRuns(db, BUILD_RUNNER_INFRA_RECOVERY);

    expect(recovered).toEqual([expect.objectContaining({ siteId: SITE, runId })]);
    expect(await run(runId)).toMatchObject({
      status: 'falhou',
      failedStep: 'paginas',
      failureMessage: INTERRUPTED_INFRA_MESSAGE,
    });
    expect((await locks()).every((owner) => owner === null)).toBe(true);
  });

  it('o worker fecha a remoção largada no esvaziamento e solta a fila', async () => {
    const runId = await requestRemoval(localDriver());
    await confirmed(runId);
    await runFirstLink(runId);
    await lock(EMPTY_SITE_MEDIA_TASK, 'worker-morto');

    const recovered = await recoverInterruptedInfraRuns(db, WORKER_INFRA_RECOVERY);

    expect(recovered).toEqual([expect.objectContaining({ siteId: SITE, runId })]);
    expect(await run(runId)).toMatchObject({
      status: 'falhou',
      failedStep: 'imagens',
      failureMessage: INTERRUPTED_WORKER_INFRA_MESSAGE,
    });
    expect((await locks()).every((owner) => owner === null)).toBe(true);
    const { rows: runnable } = await db.execute(sql`
      select 1 from graphile_worker.jobs where queue_name = ${QUEUE} and attempts < max_attempts`);
    expect(runnable).toEqual([]);
  });

  it('o build-runner não toca no esvaziamento que o worker está rodando', async () => {
    const runId = await requestRemoval(localDriver());
    await confirmed(runId);
    await runFirstLink(runId);
    await lock(EMPTY_SITE_MEDIA_TASK, 'worker-vivo');

    expect(await recoverInterruptedInfraRuns(db, BUILD_RUNNER_INFRA_RECOVERY)).toEqual([]);

    expect(await run(runId)).toMatchObject({ status: 'aplicando', currentStep: 'imagens' });
    expect(await locks()).toEqual(['worker-vivo', 'worker-vivo']);
  });

  it('o worker não toca no elo do Worker que o build-runner está rodando', async () => {
    const runId = await requestRemoval(localDriver());
    await confirmed(runId);
    await lock(INFRA_REMOVE_WORKER_TASK, 'runner-vivo');

    expect(await recoverInterruptedInfraRuns(db, WORKER_INFRA_RECOVERY)).toEqual([]);

    expect((await run(runId))?.status).toBe('aplicando');
    expect(await locks()).toEqual(['runner-vivo', 'runner-vivo']);
  });

  /** Roda só o elo 1, deixando o esvaziamento na fila. */
  async function runFirstLink(runId: number) {
    const [job] = await queued();
    expect(job?.task).toBe(INFRA_REMOVE_WORKER_TASK);
    await db.execute(sql`delete from graphile_worker._private_jobs where id = ${job?.id}::bigint`);
    await createInfraRemoveWorkerTask({ db, workers: fakeWorkers().remover })(
      { siteId: SITE, runId },
      helpers,
    );
    expect((await queued()).map((j) => j.task)).toEqual([EMPTY_SITE_MEDIA_TASK]);
  }
});

describe('segredos', () => {
  it('o container do infra-runner não recebe o token de deploy nem o S3 na remoção', async () => {
    const fake = fakeRuntime({
      image: true,
      infraPlan: {
        file: infraDestroyPlanOk([
          {
            address: 'module.site.cloudflare_zone.site',
            type: 'cloudflare_zone',
            action: 'delete',
          },
        ]),
      },
      infraApply: { file: infraDestroyed() },
    });
    const infra = tofuDriver({
      runtime: fake.runtime,
      image: 'ghcr.io/orakel-ai-content/infra-runner:abc1234',
      network: 'orakel-publish',
      env: {
        CLOUDFLARE_ACCOUNT_ID: 'f'.repeat(32),
        EMAIL_FORWARD_TO: 'caixa@orakel.example',
        CLOUDFLARE_INFRA_TOKEN: 'segredo-infra-'.padEnd(40, 'x'),
        TOFU_STATE_ACCESS_KEY_ID: 'segredo-chave',
        TOFU_STATE_SECRET_ACCESS_KEY: 'segredo-acesso',
        TOFU_STATE_PASSPHRASE: 'segredo-senha-do-estado',
      },
      timeouts: { planMs: 60_000, applyMs: 60_000, pollMs: 1 },
    });
    const runId = await requestRemoval(infra);
    await confirmed(runId);

    await drain({ workers: fakeWorkers().remover, store: memoryStore(), infra });

    expect((await run(runId))?.status).toBe('ok');
    expect(fake.started.length).toBe(2);
    for (const spec of fake.started) {
      const keys = Object.keys(spec.env);
      expect(keys).not.toContain('CLOUDFLARE_API_TOKEN');
      expect(keys.filter((key) => key.startsWith('S3_'))).toEqual([]);
    }
  });

  it('o esvaziamento só existe no backoffice-worker, e os elos de infra só no build-runner', () => {
    const runner = buildRunnerTasks({
      db,
      runtime: fakeRuntime({}).runtime,
      settings: {} as never,
      driver: { kind: 'local' },
      preview: { internalNetwork: 'orakel-internal', exportPreviewToken: 'p'.repeat(32) },
      infra: localDriver(),
      workers: fakeWorkers().remover,
    });
    const worker = workerTasks({
      db,
      store: memoryStore(),
      generation: {} as never,
      api: { url: 'http://backoffice-web:3000', token: 'g'.repeat(32) },
      zones: {} as never,
    });

    expect(Object.keys(worker)).toContain(EMPTY_SITE_MEDIA_TASK);
    expect(Object.keys(runner)).not.toContain(EMPTY_SITE_MEDIA_TASK);
    for (const task of [INFRA_REMOVE_WORKER_TASK, INFRA_APPLY_TASK]) {
      expect(Object.keys(runner)).toContain(task);
      expect(Object.keys(worker)).not.toContain(task);
    }
  });
});
