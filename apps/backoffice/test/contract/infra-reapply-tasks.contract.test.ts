import { eq, sql } from 'drizzle-orm';
import type { JobHelpers } from 'graphile-worker';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import { infraBatches, infraRuns, sites } from '../../src/db/schema/index.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { SYSTEM_ACTOR, type Actor } from '../../src/domain/access/rbac.ts';
import { upsertUser } from '../../src/domain/access/users.ts';
import {
  fakeRuntime,
  infraApplyOk,
  infraFailed,
  infraPlanOk,
} from '../../src/domain/builds/fake-runtime.ts';
import {
  InfraPlanSummarySchema,
  LOCAL_DRIFT_CHANGE,
  localDriver,
  summarizePlan,
  tofuDriver,
  type InfraDriver,
} from '../../src/domain/infra/drivers.ts';
import {
  confirmInfraBatchPlan,
  confirmInfraReapplyPlan,
  requestInfraBatchPlans,
  requestInfraReapplyPlan,
} from '../../src/domain/infra/plan.ts';
import { finishInfraRun } from '../../src/domain/infra/runs.ts';
import { INFRA_APPLY_TASK, INFRA_PLAN_TASK } from '../../src/domain/infra/schedule.ts';
import { createSite } from '../../src/domain/sites/sites.ts';
import { createInfraApplyTask } from '../../src/jobs/tasks/infra-apply.ts';
import { createInfraCheckTask } from '../../src/jobs/tasks/infra-check.ts';
import { createInfraPlanTask } from '../../src/jobs/tasks/infra-plan.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

// Reaplicação da infra e o lote dela pelas tasks do build-runner (#851): os planos de todos os
// sites antes da confirmação, o apply de um por vez encadeado pela transação que fecha o
// anterior, a parada na primeira falha e, no driver local, o site em dia depois do `ok`.

let db: Db;
let close: () => Promise<void>;

const operacao: Actor = { email: 'opa@orakel.local', roles: ['operacao'] };
const SITES = ['exemplo-a', 'exemplo-b', 'exemplo-c'] as const;
const CHANGES = [
  { address: 'module.site.cloudflare_ruleset.waf', type: 'cloudflare_ruleset', action: 'update' },
];

const errors: string[] = [];
const warnings: string[] = [];
const logger = {
  debug() {},
  info() {},
  warn(msg: string) {
    warnings.push(msg);
  },
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
  warnings.length = 0;
  await resetDatabase(db);
  const configOf = async (fixture: string) => {
    const line = (await readFixture(fixture)).find((l) => l.type === 'config');
    if (line?.type !== 'config') throw new Error('fixture sem config');
    return line.data;
  };
  const a = await configOf('exemplo-a');
  const configs = [
    a,
    await configOf('exemplo-b'),
    { ...a, siteId: 'exemplo-c', name: 'Exemplo C', domains: ['exemplo-c.com.br'] },
  ];
  for (const config of configs) {
    await db.transaction((tx) => createSite(tx, SYSTEM_ACTOR, config));
  }
  // Todos publicados e com a infra desatualizada pela conferência.
  await db.update(sites).set({ lifecycle: 'publicado', infraDriftStatus: 'desatualizado' });
  await upsertUser(db, { email: operacao.email, name: operacao.email, roles: operacao.roles });
});

async function run(runId: number) {
  const [row] = await db.select().from(infraRuns).where(eq(infraRuns.id, runId));
  return row;
}

async function site(siteId: string) {
  const [row] = await db
    .select({ lifecycle: sites.lifecycle, drift: sites.infraDriftStatus })
    .from(sites)
    .where(eq(sites.id, siteId));
  return row;
}

/** Jobs da fila `infra:<site>`: a task e o site, na ordem em que entraram. */
async function jobs() {
  const { rows } = await db.execute<{ task: string; site: string }>(sql`
    select task_identifier as task, substring(queue_name from '^infra:(.+)$') as site
    from graphile_worker.jobs where queue_name like 'infra:%' order by id`);
  return rows;
}

const plan = (infra: InfraDriver, siteId: string, runId: number) =>
  createInfraPlanTask({ db, infra })({ siteId, runId }, helpers);
const apply = (infra: InfraDriver, siteId: string, runId: number) =>
  createInfraApplyTask({ db, infra })({ siteId, runId }, helpers);

function tofu(failing?: string) {
  const fake = fakeRuntime({
    image: true,
    infraBySite: Object.fromEntries(
      SITES.map((id) => [
        id,
        {
          infraPlan: { file: infraPlanOk(CHANGES, id) },
          infraApply:
            id === failing
              ? { exitCode: 10, file: infraFailed('permanent', 'regra recusada pela API', id) }
              : { file: infraApplyOk(id) },
        },
      ]),
    ),
  });
  const driver = tofuDriver({
    runtime: fake.runtime,
    image: 'ghcr.io/orakel-ai-content/infra-runner:abc1234',
    network: 'orakel-publish',
    env: {},
    timeouts: { planMs: 60_000, applyMs: 60_000, pollMs: 1 },
  });
  return { ...fake, driver };
}

describe('reaplicação de um site', () => {
  it('o plano grava o resumo e para em aguardando_confirmacao, sem aplicar nada', async () => {
    const t = tofu();
    const requested = await db.transaction((tx) =>
      requestInfraReapplyPlan(tx, operacao, 'exemplo-a'),
    );
    if (!requested.ok) throw new Error(JSON.stringify(requested.issues));
    const { runId } = requested.value;
    expect(await jobs()).toEqual([{ task: INFRA_PLAN_TASK, site: 'exemplo-a' }]);

    await plan(t.driver, 'exemplo-a', runId);

    const row = await run(runId);
    expect(row).toMatchObject({ tipo: 'reaplicar', status: 'aguardando_confirmacao' });
    const summary = InfraPlanSummarySchema.parse(JSON.parse(row?.planSummary ?? ''));
    expect(summary.steps.regras).toEqual(CHANGES);
    expect(t.started.map((spec) => spec.command)).toEqual([['plan']]);
    // O plano da reaplicação roda no modo da criação.
    expect(t.started[0]?.env.INFRA_MODE).toBeUndefined();

    await apply(t.driver, 'exemplo-a', runId);
    expect(t.started.map((spec) => spec.command)).toEqual([['plan']]);
    expect(await jobs()).toEqual([{ task: INFRA_PLAN_TASK, site: 'exemplo-a' }]);
  });

  it('no local, depois do ok o site deixa de estar desatualizado, também na conferência', async () => {
    const local = localDriver({ driftSites: ['exemplo-a'] });
    const requested = await db.transaction((tx) =>
      requestInfraReapplyPlan(tx, operacao, 'exemplo-a'),
    );
    if (!requested.ok) throw new Error(JSON.stringify(requested.issues));
    const { runId } = requested.value;
    await plan(local, 'exemplo-a', runId);
    expect(JSON.parse((await run(runId))?.planSummary ?? '')).toEqual(
      summarizePlan([LOCAL_DRIFT_CHANGE]),
    );

    const confirmed = await db.transaction((tx) =>
      confirmInfraReapplyPlan(tx, operacao, 'exemplo-a', runId),
    );
    expect(confirmed.ok).toBe(true);
    expect((await jobs()).map((job) => job.task)).toEqual([INFRA_PLAN_TASK, INFRA_APPLY_TASK]);

    await apply(local, 'exemplo-a', runId);
    expect(await run(runId)).toMatchObject({ status: 'ok' });
    expect(await site('exemplo-a')).toEqual({ lifecycle: 'publicado', drift: 'em_dia' });

    await createInfraCheckTask({ db, infra: local })({ siteId: 'exemplo-a' }, helpers);
    expect((await site('exemplo-a'))?.drift).toBe('em_dia');
    expect(errors).toEqual([]);
  });
});

describe('lote de reaplicação', () => {
  async function requestBatch() {
    const requested = await db.transaction((tx) => requestInfraBatchPlans(tx, operacao));
    if (!requested.ok) throw new Error(JSON.stringify(requested.issues));
    return requested.value;
  }
  const runOf = (runs: { siteId: string; runId: number }[], siteId: string) =>
    runs.find((r) => r.siteId === siteId)?.runId ?? -1;

  it('gera todos os planos antes; nenhum apply começa antes da confirmação', async () => {
    const t = tofu();
    const batch = await requestBatch();
    expect(await jobs()).toEqual(SITES.map((id) => ({ task: INFRA_PLAN_TASK, site: id })));

    for (const { siteId, runId } of batch.runs) await plan(t.driver, siteId, runId);
    const [state] = await db.select().from(infraBatches);
    expect(state?.state).toBe('aguardando_confirmacao');

    // Sem a confirmação, o apply do primeiro é ignorado e nada mais é enfileirado.
    await apply(t.driver, 'exemplo-a', runOf(batch.runs, 'exemplo-a'));
    expect(t.started.every((spec) => spec.command[0] === 'plan')).toBe(true);
    expect((await jobs()).filter((job) => job.task === INFRA_APPLY_TASK)).toEqual([]);

    const first = await db.transaction((tx) => confirmInfraBatchPlan(tx, operacao, batch.batchId));
    expect(first).toMatchObject({ ok: true, value: { siteId: 'exemplo-a' } });
    expect((await jobs()).filter((job) => job.task === INFRA_APPLY_TASK)).toEqual([
      { task: INFRA_APPLY_TASK, site: 'exemplo-a' },
    ]);
  });

  it('com o segundo forçado a falhar, o primeiro fecha ok, o segundo falhou e o terceiro não aplica', async () => {
    const t = tofu('exemplo-b');
    const batch = await requestBatch();
    for (const { siteId, runId } of batch.runs) await plan(t.driver, siteId, runId);
    expect(
      (await db.transaction((tx) => confirmInfraBatchPlan(tx, operacao, batch.batchId))).ok,
    ).toBe(true);

    await apply(t.driver, 'exemplo-a', runOf(batch.runs, 'exemplo-a'));
    expect(await run(runOf(batch.runs, 'exemplo-a'))).toMatchObject({ status: 'ok' });
    expect((await site('exemplo-a'))?.drift).toBe('em_dia');
    // A transação que fechou o primeiro enfileirou o apply do segundo.
    expect((await jobs()).filter((job) => job.task === INFRA_APPLY_TASK)).toEqual([
      { task: INFRA_APPLY_TASK, site: 'exemplo-a' },
      { task: INFRA_APPLY_TASK, site: 'exemplo-b' },
    ]);

    await apply(t.driver, 'exemplo-b', runOf(batch.runs, 'exemplo-b'));
    const failed = await run(runOf(batch.runs, 'exemplo-b'));
    expect(failed).toMatchObject({
      status: 'falhou',
      failedStep: 'regras',
      failureMessage: 'regra recusada pela API',
    });

    const third = runOf(batch.runs, 'exemplo-c');
    expect(await run(third)).toMatchObject({ status: 'cancelado' });
    expect((await jobs()).filter((job) => job.task === INFRA_APPLY_TASK)).toEqual([
      { task: INFRA_APPLY_TASK, site: 'exemplo-a' },
      { task: INFRA_APPLY_TASK, site: 'exemplo-b' },
    ]);
    await apply(t.driver, 'exemplo-c', third);
    expect(
      t.started.filter((spec) => spec.command[0] === 'apply').map((s) => s.labels['orakel.site']),
    ).toEqual(['exemplo-a', 'exemplo-b']);
    expect((await site('exemplo-c'))?.drift).toBe('desatualizado');
    const [state] = await db.select().from(infraBatches);
    expect(state?.state).toBe('interrompido');
  });

  it('o plano de um site que o lote cancelou enquanto rodava é descartado com aviso', async () => {
    const batch = await requestBatch();
    const a = runOf(batch.runs, 'exemplo-a');
    const b = runOf(batch.runs, 'exemplo-b');
    const local = localDriver();
    // Enquanto o plano de b roda, o de a falha e para o lote.
    const racing: InfraDriver = {
      ...local,
      plan: async (target) => {
        await db.transaction((tx) =>
          finishInfraRun(tx, a, { status: 'falhou', step: null, message: 'pane' }),
        );
        return local.plan(target);
      },
    };

    await plan(racing, 'exemplo-b', b);

    expect(await run(b)).toMatchObject({ status: 'cancelado', planSummary: null });
    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.includes('descartado'))).toBe(true);
  });
});
