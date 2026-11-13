import type { JobHelpers } from 'graphile-worker';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as BuildsModule from '../../domain/builds/builds.ts';
import type * as SiteStateModule from '../../domain/builds/site-state.ts';
import type * as RunsModule from '../../domain/infra/runs.ts';
import type * as ScheduleModule from '../../domain/infra/schedule.ts';

import type { Db } from '../../db/client.ts';
import { fakeRuntime, infraFailed, infraPlanOk } from '../../domain/builds/fake-runtime.ts';
import {
  LOCAL_DRIFT_CHANGE,
  localDriver,
  summarizePlan,
  tofuDriver,
  type InfraDriver,
} from '../../domain/infra/drivers.ts';
import { createInfraCheckTask } from './infra-check.ts';

// A leitura, a gravação e o enfileiramento são espionados; o SQL de verdade fica no contrato
// (infra-tasks.contract.test.ts).
const mocks = vi.hoisted(() => ({
  sitesForInfraDrift: vi.fn(),
  recordInfraDrift: vi.fn(),
  hasOpenInfraRun: vi.fn(),
  loadBuildTarget: vi.fn(),
  scheduleSiteInfraDriftCheck: vi.fn(),
}));
vi.mock('../../domain/builds/site-state.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof SiteStateModule>()),
  sitesForInfraDrift: mocks.sitesForInfraDrift,
  recordInfraDrift: mocks.recordInfraDrift,
}));
vi.mock('../../domain/infra/runs.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof RunsModule>()),
  hasOpenInfraRun: mocks.hasOpenInfraRun,
}));
vi.mock('../../domain/builds/builds.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof BuildsModule>()),
  loadBuildTarget: mocks.loadBuildTarget,
}));
vi.mock('../../domain/infra/schedule.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof ScheduleModule>()),
  scheduleSiteInfraDriftCheck: mocks.scheduleSiteInfraDriftCheck,
}));

const tx = { tx: true };
const db = { transaction: (fn: (t: unknown) => unknown) => fn(tx) } as unknown as Db;
const NOW = new Date('2026-11-13T06:00:00Z');
const IMAGE = 'ghcr.io/orakel-ai-content/infra-runner:abc1234';
const CHANGE = {
  address: 'module.site.cloudflare_ruleset.waf',
  type: 'cloudflare_ruleset',
  action: 'update' as const,
};

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.sitesForInfraDrift.mockResolvedValue(['exemplo-a', 'exemplo-b']);
  mocks.hasOpenInfraRun.mockResolvedValue(false);
  mocks.loadBuildTarget.mockImplementation((_db: unknown, siteId: string) =>
    Promise.resolve({ siteId, domain: `${siteId}.com.br` }),
  );
});

function run(infra: InfraDriver, payload: unknown) {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const done = createInfraCheckTask({ db, infra, now: () => NOW.getTime() })(payload, {
    logger,
  } as unknown as JobHelpers);
  return { done, logger };
}

function tofu(infraPlan: Parameters<typeof fakeRuntime>[0]['infraPlan']) {
  const fake = fakeRuntime({ image: true, infraPlan });
  const driver = tofuDriver({
    runtime: fake.runtime,
    image: IMAGE,
    network: 'orakel-publish',
    env: {},
    timeouts: { planMs: 60_000, applyMs: 60_000, pollMs: 1 },
  });
  return { ...fake, driver };
}

describe('infra-check sem payload', () => {
  it('enfileira um job por site elegível, numa transação, sem rodar plano', async () => {
    const t = tofu({ file: infraPlanOk([]) });
    await run(t.driver, {}).done;

    expect(mocks.scheduleSiteInfraDriftCheck.mock.calls).toEqual([
      [tx, 'exemplo-a'],
      [tx, 'exemplo-b'],
    ]);
    expect(t.started).toEqual([]);
    expect(mocks.recordInfraDrift).not.toHaveBeenCalled();
  });
});

describe('infra-check de um site', () => {
  it('plano com mudanças grava desatualizado, com o resumo', async () => {
    const t = tofu({ file: infraPlanOk([CHANGE]) });
    await run(t.driver, { siteId: 'exemplo-a' }).done;

    expect(mocks.recordInfraDrift).toHaveBeenCalledWith(
      tx,
      'exemplo-a',
      { kind: 'desatualizado', summary: JSON.stringify(summarizePlan([CHANGE])) },
      NOW,
    );
    expect(t.started[0]).toMatchObject({
      name: 'orakel-infra-check-exemplo-a',
      env: { SITE_ID: 'exemplo-a', DOMAIN: 'exemplo-a.com.br' },
    });
  });

  it('plano sem mudanças grava em dia', async () => {
    const t = tofu({ file: infraPlanOk([]) });
    await run(t.driver, { siteId: 'exemplo-a' }).done;

    expect(mocks.recordInfraDrift).toHaveBeenCalledWith(tx, 'exemplo-a', { kind: 'em_dia' }, NOW);
  });

  it('falha do plano grava falhou com o motivo, sem lançar', async () => {
    const t = tofu({ exitCode: 10, file: infraFailed('permanent', 'token inválido') });
    const { done, logger } = run(t.driver, { siteId: 'exemplo-a' });
    await done;

    expect(mocks.recordInfraDrift).toHaveBeenCalledWith(
      tx,
      'exemplo-a',
      { kind: 'falhou', message: 'token inválido' },
      NOW,
    );
    expect(logger.warn).toHaveBeenCalled();
  });

  it('erro inesperado do driver também grava falhou', async () => {
    const broken: InfraDriver = {
      ...localDriver(),
      check: () => Promise.reject(new Error('pane')),
    };
    await run(broken, { siteId: 'exemplo-a' }).done;

    expect(mocks.recordInfraDrift).toHaveBeenCalledWith(
      tx,
      'exemplo-a',
      { kind: 'falhou', message: 'Erro inesperado na conferência: pane' },
      NOW,
    );
  });

  it('site com execução de infra aberta é pulado, sem plano nem gravação', async () => {
    mocks.hasOpenInfraRun.mockResolvedValue(true);
    const t = tofu({ file: infraPlanOk([CHANGE]) });
    await run(t.driver, { siteId: 'exemplo-a' }).done;

    expect(mocks.hasOpenInfraRun).toHaveBeenCalledWith(db, 'exemplo-a');
    expect(t.started).toEqual([]);
    expect(mocks.recordInfraDrift).not.toHaveBeenCalled();
  });

  it('site que deixou de ter infra aplicada é pulado', async () => {
    mocks.sitesForInfraDrift.mockResolvedValue(['exemplo-b']);
    const t = tofu({ file: infraPlanOk([CHANGE]) });
    await run(t.driver, { siteId: 'exemplo-a' }).done;

    expect(t.started).toEqual([]);
    expect(mocks.recordInfraDrift).not.toHaveBeenCalled();
  });

  it('com o driver local, só o site configurado sai desatualizado', async () => {
    const infra = localDriver({ driftSites: ['exemplo-b'] });
    await run(infra, { siteId: 'exemplo-a' }).done;
    await run(infra, { siteId: 'exemplo-b' }).done;

    expect(mocks.recordInfraDrift.mock.calls).toEqual([
      [tx, 'exemplo-a', { kind: 'em_dia' }, NOW],
      [
        tx,
        'exemplo-b',
        { kind: 'desatualizado', summary: JSON.stringify(summarizePlan([LOCAL_DRIFT_CHANGE])) },
        NOW,
      ],
    ]);
  });

  it('payload inválido lança', async () => {
    await expect(run(localDriver(), { siteId: 7 }).done).rejects.toThrow(/inválido/);
  });
});
