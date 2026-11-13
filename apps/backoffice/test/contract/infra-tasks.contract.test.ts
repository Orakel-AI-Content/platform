import { eq, sql } from 'drizzle-orm';
import type { JobHelpers } from 'graphile-worker';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import { infraRuns, sites, type InfraStep } from '../../src/db/schema/index.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { SYSTEM_ACTOR, type Actor } from '../../src/domain/access/rbac.ts';
import { upsertUser } from '../../src/domain/access/users.ts';
import {
  fakeRuntime,
  infraApplyOk,
  infraDestroyed,
  infraDestroyPlanOk,
  infraFailed,
  infraPlanOk,
  type FakeStage,
} from '../../src/domain/builds/fake-runtime.ts';
import {
  InfraPlanSummarySchema,
  LOCAL_NAMESERVERS,
  localDriver,
  tofuDriver,
  type InfraDriver,
} from '../../src/domain/infra/drivers.ts';
import { confirmInfraRun, hasOpenInfraRun, requestInfraRun } from '../../src/domain/infra/runs.ts';
import {
  INFRA_APPLY_TASK,
  INFRA_CHECK_ALL_KEY,
  INFRA_CHECK_TASK,
  INFRA_PLAN_TASK,
  INTERRUPTED_INFRA_MESSAGE,
  recoverInterruptedInfraRuns,
  scheduleInfraApply,
  scheduleInfraCheckAll,
  scheduleInfraPlan,
} from '../../src/domain/infra/schedule.ts';
import { createSite } from '../../src/domain/sites/sites.ts';
import { createInfraApplyTask } from '../../src/jobs/tasks/infra-apply.ts';
import { createInfraCheckTask } from '../../src/jobs/tasks/infra-check.ts';
import { createInfraPlanTask } from '../../src/jobs/tasks/infra-plan.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

// Tasks do plano e do apply da infra do site (#824) e da remoção (#839): gravam em `infra_runs`
// pelo domínio, com o driver local e com o driver tofu sobre o runtime falso; fila e recuperação
// na partida.

let db: Db;
let close: () => Promise<void>;

const operacao: Actor = { email: 'opa@orakel.local', roles: ['operacao'] };
const admin: Actor = { email: 'adm@orakel.local', roles: ['admin'] };
const SITE = 'exemplo-a';
let domain = '';
const IMAGE = 'ghcr.io/orakel-ai-content/infra-runner:abc1234';
const SECRETS = {
  CLOUDFLARE_INFRA_TOKEN: 'segredo-infra-'.padEnd(40, 'x'),
  TOFU_STATE_ACCESS_KEY_ID: 'segredo-chave',
  TOFU_STATE_SECRET_ACCESS_KEY: 'segredo-acesso',
  TOFU_STATE_PASSPHRASE: 'segredo-senha-do-estado',
};
const INPUTS = { CLOUDFLARE_ACCOUNT_ID: 'f'.repeat(32), EMAIL_FORWARD_TO: 'caixa@orakel.example' };
const CHANGES = [
  { address: 'module.site.cloudflare_zone.site', type: 'cloudflare_zone', action: 'create' },
  {
    address: 'module.site.cloudflare_dns_record.spf',
    type: 'cloudflare_dns_record',
    action: 'create',
  },
  {
    address: 'module.site.cloudflare_r2_bucket.media',
    type: 'cloudflare_r2_bucket',
    action: 'create',
  },
];

const errors: string[] = [];
const logger = {
  debug() {},
  info() {},
  warn() {},
  error(msg: string) {
    errors.push(msg);
  },
};
const helpers = { logger, job: { id: '1', attempts: 1, max_attempts: 1 } } as unknown as JobHelpers;

beforeAll(async () => {
  ({ db, close } = await setupDatabase());
});
afterAll(() => close());
beforeEach(async () => {
  errors.length = 0;
  await resetDatabase(db);
  const line = (await readFixture(SITE)).find((l) => l.type === 'config');
  if (line?.type !== 'config') throw new Error('fixture sem config');
  domain = line.data.domains[0] ?? '';
  await db.transaction((tx) => createSite(tx, SYSTEM_ACTOR, line.data));
  for (const actor of [operacao, admin]) {
    await upsertUser(db, { email: actor.email, name: actor.email, roles: actor.roles });
  }
});

async function request(): Promise<number> {
  const result = await db.transaction((tx) => requestInfraRun(tx, operacao, SITE));
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value.id;
}

async function confirm(runId: number): Promise<void> {
  const result = await db.transaction((tx) => confirmInfraRun(tx, operacao, runId));
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

const plan = (infra: InfraDriver, runId: number) =>
  createInfraPlanTask({ db, infra })({ siteId: SITE, runId }, helpers);
const apply = (infra: InfraDriver, runId: number) =>
  createInfraApplyTask({ db, infra })({ siteId: SITE, runId }, helpers);

function tofu(stages: { infraPlan?: FakeStage; infraApply?: FakeStage }) {
  const fake = fakeRuntime({ image: true, ...stages });
  const driver = tofuDriver({
    runtime: fake.runtime,
    image: IMAGE,
    network: 'orakel-publish',
    env: { ...INPUTS, ...SECRETS },
    timeouts: { planMs: 60_000, applyMs: 60_000, pollMs: 1 },
  });
  return { ...fake, driver };
}

describe('infra-plan', () => {
  it('grava o resumo por etapa e espera a confirmação, sem aplicar nada', async () => {
    const t = tofu({
      infraPlan: { file: infraPlanOk(CHANGES) },
      infraApply: { file: infraApplyOk() },
    });
    const runId = await request();

    await plan(t.driver, runId);

    const row = await run(runId);
    expect(row).toMatchObject({ status: 'aguardando_confirmacao', currentStep: null });
    const summary = InfraPlanSummarySchema.parse(JSON.parse(row?.planSummary ?? ''));
    expect(summary.steps.endereco).toHaveLength(1);
    expect(summary.steps.dns).toHaveLength(1);
    expect(summary.steps.imagens).toHaveLength(1);
    expect(summary.steps.email).toEqual([]);
    expect(t.started.map((spec) => spec.command)).toEqual([['plan']]);

    // Sem a confirmação, o apply não roda: a execução não está `aplicando`.
    await apply(t.driver, runId);
    expect(t.started.map((spec) => spec.command)).toEqual([['plan']]);
    expect((await run(runId))?.status).toBe('aguardando_confirmacao');
    expect(await lifecycle()).toBe('cadastrado');
  });

  it('falha no plano fecha a execução sem etapa e apaga o volume', async () => {
    const t = tofu({
      infraPlan: { exitCode: 10, file: infraFailed('permanent', 'token sem permissão') },
    });
    const runId = await request();

    await plan(t.driver, runId);

    expect(await run(runId)).toMatchObject({
      status: 'falhou',
      failedStep: null,
      failureMessage: 'token sem permissão',
    });
    expect(t.volumes.removed).toEqual([`orakel-infra-${runId}`]);
    expect(t.removed).toEqual([`orakel-infra-plan-${runId}`]);
  });

  it('erro inesperado do driver também fecha a execução', async () => {
    const runId = await request();
    const broken: InfraDriver = {
      kind: 'local',
      plan: () => Promise.reject(new Error('pane')),
      apply: () => Promise.reject(new Error('pane')),
      check: () => Promise.reject(new Error('pane')),
    };
    await plan(broken, runId);
    expect(await run(runId)).toMatchObject({
      status: 'falhou',
      failureMessage: 'Erro inesperado no plano: pane',
    });
  });
});

describe('infra-apply', () => {
  it('grava a etapa corrente conforme avança e fecha ok com os nameservers', async () => {
    const runId = await request();
    const local = localDriver();
    await plan(local, runId);
    await confirm(runId);

    const seen: (InfraStep | null | undefined)[] = [];
    const watched: InfraDriver = {
      ...local,
      apply: (target, onStep) =>
        local.apply(target, async (step) => {
          await onStep(step);
          seen.push((await run(runId))?.currentStep);
        }),
    };
    await apply(watched, runId);

    expect(seen).toEqual(['endereco', 'dns', 'email', 'regras', 'imagens']);
    expect(await run(runId)).toMatchObject({
      status: 'ok',
      currentStep: null,
      nameservers: LOCAL_NAMESERVERS,
    });
    expect(await lifecycle()).toBe('infra_aplicada');
  });

  it('falha fecha com a etapa e o motivo, e o site não avança', async () => {
    const log = [
      JSON.stringify({
        type: 'apply_start',
        hook: { resource: { resource_type: 'cloudflare_zone' } },
      }),
      JSON.stringify({
        type: 'apply_start',
        hook: { resource: { resource_type: 'cloudflare_dns_record' } },
      }),
      JSON.stringify({
        type: 'apply_errored',
        hook: { resource: { resource_type: 'cloudflare_dns_record' } },
      }),
    ].join('\n');
    const t = tofu({
      infraPlan: { file: infraPlanOk(CHANGES) },
      infraApply: {
        exitCode: 10,
        log,
        file: infraFailed('permanent', 'Falha no apply: registro duplicado'),
      },
    });
    const runId = await request();
    await plan(t.driver, runId);
    await confirm(runId);

    await apply(t.driver, runId);

    expect(await run(runId)).toMatchObject({
      status: 'falhou',
      failedStep: 'dns',
      failureMessage: 'Falha no apply: registro duplicado',
    });
    expect(await lifecycle()).toBe('cadastrado');
  });

  it('apply que falha antes do primeiro recurso fica na primeira etapa do plano', async () => {
    const t = tofu({
      infraPlan: { file: infraPlanOk(CHANGES.slice(1)) },
      infraApply: { exitCode: 20 },
    });
    const runId = await request();
    await plan(t.driver, runId);
    await confirm(runId);

    await apply(t.driver, runId);

    expect(await run(runId)).toMatchObject({ status: 'falhou', failedStep: 'dns' });
  });

  it('depois da falha forçada no driver local, a nova execução só cria o que faltou', async () => {
    const local = localDriver({ failStep: 'email' });
    const first = await request();
    await plan(local, first);
    await confirm(first);
    await apply(local, first);
    expect(await run(first)).toMatchObject({ status: 'falhou', failedStep: 'email' });

    const retry = await request();
    await plan(local, retry);
    const summary = InfraPlanSummarySchema.parse(JSON.parse((await run(retry))?.planSummary ?? ''));
    expect(summary.steps.endereco).toEqual([]);
    expect(summary.steps.dns).toEqual([]);
    expect(summary.steps.email.length).toBeGreaterThan(0);

    await confirm(retry);
    const steps: InfraStep[] = [];
    await apply(
      {
        ...local,
        apply: (target, onStep) => local.apply(target, (s) => (steps.push(s), onStep(s))),
      },
      retry,
    );
    expect(steps).toEqual(['email', 'regras', 'imagens']);
    expect(await run(retry)).toMatchObject({ status: 'ok', nameservers: LOCAL_NAMESERVERS });
    expect(await lifecycle()).toBe('infra_aplicada');
  });

  it('o container recebe só a entrada e os segredos de infra; container e volume saem no fim', async () => {
    const t = tofu({
      infraPlan: { file: infraPlanOk(CHANGES) },
      infraApply: { file: infraApplyOk() },
    });
    const runId = await request();
    await plan(t.driver, runId);
    await confirm(runId);
    await apply(t.driver, runId);

    const domain = (await readFixture(SITE)).find((l) => l.type === 'config');
    if (domain?.type !== 'config') throw new Error('fixture sem config');
    const expected = { ...INPUTS, ...SECRETS, SITE_ID: SITE, DOMAIN: domain.data.domains[0] };
    for (const spec of t.started) expect(spec.env).toEqual(expected);
    expect(Object.keys(t.started[0]?.env ?? {})).not.toContain('CLOUDFLARE_API_TOKEN');
    expect(t.removed).toEqual([`orakel-infra-plan-${runId}`, `orakel-infra-apply-${runId}`]);
    expect(t.volumes).toEqual({
      created: [`orakel-infra-${runId}`],
      removed: [`orakel-infra-${runId}`],
    });
    expect((await run(runId))?.status).toBe('ok');
  });
});

describe('fila e recuperação', () => {
  async function jobs() {
    const { rows } = await db.execute<{
      id: string;
      task_identifier: string;
      queue_name: string;
      max_attempts: number;
    }>(sql`select id::text, task_identifier, queue_name, max_attempts from graphile_worker.jobs
           where queue_name like 'infra:%'
           order by id`);
    return rows;
  }

  it('enfileira o plano e o apply na fila infra:<site>, numa tentativa só', async () => {
    const runId = await request();
    await db.transaction((tx) => scheduleInfraPlan(tx, { siteId: SITE, runId }));
    await db.transaction((tx) => scheduleInfraApply(tx, { siteId: SITE, runId }));
    expect(await jobs()).toEqual([
      expect.objectContaining({
        task_identifier: INFRA_PLAN_TASK,
        queue_name: 'infra:exemplo-a',
        max_attempts: 1,
      }),
      expect.objectContaining({
        task_identifier: INFRA_APPLY_TASK,
        queue_name: 'infra:exemplo-a',
        max_attempts: 1,
      }),
    ]);
  });

  it('na partida, fecha a execução cujo job ficou travado e solta a fila', async () => {
    const runId = await request();
    await db.transaction((tx) => scheduleInfraPlan(tx, { siteId: SITE, runId }));
    await db.execute(sql`
      update graphile_worker._private_jobs set locked_by = 'morto', locked_at = now(),
        attempts = attempts + 1
      where task_id in (select id from graphile_worker._private_tasks where identifier like 'infra-%')`);
    await db.execute(sql`
      update graphile_worker._private_job_queues set locked_by = 'morto', locked_at = now()
      where queue_name = 'infra:exemplo-a'`);
    const [job] = await jobs();

    expect(await recoverInterruptedInfraRuns(db)).toEqual([
      { siteId: SITE, runId, jobId: job?.id },
    ]);

    expect(await run(runId)).toMatchObject({
      status: 'falhou',
      failureMessage: INTERRUPTED_INFRA_MESSAGE,
    });
    const { rows: locked } = await db.execute(sql`
      select 1 from graphile_worker._private_job_queues where locked_by is not null
      union all select 1 from graphile_worker.jobs where locked_by is not null`);
    expect(locked).toEqual([]);
    // O job não volta a rodar: a execução já fechou.
    const { rows: runnable } = await db.execute(sql`
      select 1 from graphile_worker.jobs
      where queue_name like 'infra:%' and attempts < max_attempts`);
    expect(runnable).toEqual([]);
  });

  it('execução aguardando confirmação e jobs de outras filas não são tocados', async () => {
    const runId = await request();
    await plan(localDriver(), runId);
    await db.execute(
      sql`select graphile_worker.add_job('build', '{}'::json, queue_name => 'build:exemplo-a')`,
    );
    await db.execute(
      sql`update graphile_worker._private_jobs set locked_by = 'outro', locked_at = now()`,
    );

    expect(await recoverInterruptedInfraRuns(db)).toEqual([]);
    expect((await run(runId))?.status).toBe('aguardando_confirmacao');
    const { rows } = await db.execute<{ locked_by: string | null }>(
      sql`select locked_by from graphile_worker.jobs`,
    );
    // O build do cadastro e o pedido acima seguem travados pelo dono deles.
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.locked_by === 'outro')).toBe(true);
  });
});

describe('infra-check', () => {
  async function applied(): Promise<void> {
    const local = localDriver();
    const runId = await request();
    await plan(local, runId);
    await confirm(runId);
    await apply(local, runId);
  }

  const check = (infra: InfraDriver, payload: unknown) =>
    createInfraCheckTask({ db, infra })(payload, helpers);

  async function checkJobs() {
    const { rows } = await db.execute<{
      queue_name: string | null;
      key: string | null;
      max_attempts: number;
    }>(sql`select queue_name, key, max_attempts from graphile_worker.jobs
           where task_identifier = ${INFRA_CHECK_TASK} order by id`);
    return rows;
  }

  it('a distribuição enfileira um job por site na fila infra:<site>, sem duplicar', async () => {
    await applied();
    await check(localDriver(), {});
    await check(localDriver(), {});

    expect(await checkJobs()).toEqual([
      { queue_name: 'infra:exemplo-a', key: 'infra-check:exemplo-a', max_attempts: 1 },
    ]);
  });

  it('a da partida fica fora das filas de site, com uma chave só', async () => {
    await db.transaction((tx) => scheduleInfraCheckAll(tx));
    await db.transaction((tx) => scheduleInfraCheckAll(tx));

    expect(await checkJobs()).toEqual([
      { queue_name: null, key: INFRA_CHECK_ALL_KEY, max_attempts: 1 },
    ]);
  });

  it('site em cadastrado não entra na distribuição', async () => {
    await check(localDriver(), {});
    expect(await checkJobs()).toEqual([]);
  });

  it('grava no site o resultado da conferência', async () => {
    await applied();
    await check(localDriver({ driftSites: [SITE] }), { siteId: SITE });

    const [row] = await db
      .select({ status: sites.infraDriftStatus, summary: sites.infraDriftSummary })
      .from(sites)
      .where(eq(sites.id, SITE));
    expect(row?.status).toBe('desatualizado');
    expect(InfraPlanSummarySchema.parse(JSON.parse(row?.summary ?? '')).steps.regras).toHaveLength(
      1,
    );
  });

  it('execução de infra aberta é vista até fechar', async () => {
    const local = localDriver();
    const runId = await request();
    expect(await hasOpenInfraRun(db, SITE)).toBe(true);
    await plan(local, runId);
    await confirm(runId);
    await apply(local, runId);
    expect(await hasOpenInfraRun(db, SITE)).toBe(false);
  });
});
