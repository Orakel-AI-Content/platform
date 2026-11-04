import { describe, expect, it } from 'vitest';

import type { ContainerRuntime } from './runtime.ts';
import { failedFile, fakeRuntime, rollbackOk } from './fake-runtime.ts';
import { runRollback, type RollbackPlan } from './run-rollback.ts';

const version = '20261001T120000Z-abcdef12';
const plan: RollbackPlan = {
  siteId: 'exemplo-a',
  versionId: version,
  release: 'local',
  image: 'site-builder:local',
  runId: 'exemplo-a-9-1',
  network: 'orakel-publish',
  timeoutMs: 60_000,
  env: { SITE_ID: 'exemplo-a', VERSION_ID: version, DEPLOY_TARGET: 'local' },
};

let clock = 0;
const now = () => (clock += 100);

describe('runRollback', () => {
  it('roda um único container rollback na rede publish, no volume próprio', async () => {
    const fake = fakeRuntime({ rollback: { file: rollbackOk() } });
    const outcome = await runRollback(plan, { runtime: fake.runtime, now });
    expect(outcome).toMatchObject({ status: 'ok', rollback: { versionId: version } });
    expect(fake.started).toHaveLength(1);
    expect(fake.started[0]).toMatchObject({
      name: 'orakel-rollback-exemplo-a-9-1',
      command: ['rollback'],
      network: 'orakel-publish',
      env: plan.env,
      volume: { name: 'orakel-build-exemplo-a-9-1', target: '/build' },
      labels: { 'orakel.build': 'exemplo-a-9-1', 'orakel.site': 'exemplo-a' },
    });
    expect(fake.removed).toEqual(['orakel-rollback-exemplo-a-9-1']);
    expect(fake.volumes).toEqual({
      created: ['orakel-build-exemplo-a-9-1'],
      removed: ['orakel-build-exemplo-a-9-1'],
    });
  });

  it('a falha vem do rollback.json, com a classificação dele', async () => {
    const fake = fakeRuntime({
      rollback: { exitCode: 10, file: failedFile('permanent', 'Versão não existe no alvo') },
    });
    expect(await runRollback(plan, { runtime: fake.runtime, now })).toMatchObject({
      status: 'failed',
      failure: { kind: 'permanent', message: 'Versão não existe no alvo' },
    });
    expect(fake.removed).toHaveLength(1);
    expect(fake.volumes.removed).toHaveLength(1);
  });

  it('sem arquivo, o código de saída classifica (10 permanente, o resto transitório)', async () => {
    const permanent = await runRollback(plan, {
      runtime: fakeRuntime({ rollback: { exitCode: 10 } }).runtime,
      now,
    });
    const transient = await runRollback(plan, {
      runtime: fakeRuntime({ rollback: { exitCode: 137 } }).runtime,
      now,
    });
    expect(permanent).toMatchObject({ status: 'failed', failure: { kind: 'permanent' } });
    expect(transient).toMatchObject({ status: 'failed', failure: { kind: 'transient' } });
  });

  it.each([
    ['inválido', { status: 'ok' }],
    ['de outro site', rollbackOk('exemplo-b')],
    ['com outra versão', rollbackOk('exemplo-a', '20260901T000000Z-00000000')],
  ])('rollback.json %s é falha transitória', async (_, file) => {
    const outcome = await runRollback(plan, {
      runtime: fakeRuntime({ rollback: { file } }).runtime,
      now,
    });
    expect(outcome).toMatchObject({ status: 'failed', failure: { kind: 'transient' } });
  });

  it('arquivo que não é JSON é falha transitória', async () => {
    const fake = fakeRuntime({});
    const runtime: ContainerRuntime = { ...fake.runtime, readFile: () => Promise.resolve('{') };
    expect(await runRollback(plan, { runtime, now })).toMatchObject({
      status: 'failed',
      failure: { kind: 'transient' },
    });
    expect(fake.volumes.removed).toHaveLength(1);
  });

  it('estourou o tempo: mata o container, transitória, e limpa', async () => {
    const fake = fakeRuntime({ rollback: { timedOut: true } });
    expect(await runRollback(plan, { runtime: fake.runtime, now })).toMatchObject({
      status: 'failed',
      failure: { kind: 'transient' },
    });
    expect(fake.killed).toEqual(['orakel-rollback-exemplo-a-9-1']);
    expect(fake.removed).toEqual(['orakel-rollback-exemplo-a-9-1']);
    expect(fake.volumes.removed).toHaveLength(1);
  });

  it('erro do runtime é transitório e o volume criado é removido', async () => {
    const fake = fakeRuntime({ failOn: 'start' });
    expect(await runRollback(plan, { runtime: fake.runtime, now })).toMatchObject({
      status: 'failed',
      failure: { kind: 'transient', message: 'rollback: proxy recusou' },
    });
    expect(fake.volumes.removed).toEqual(['orakel-build-exemplo-a-9-1']);
  });

  it('imagem fora do host: permanente, sem criar volume', async () => {
    const fake = fakeRuntime({ image: false });
    expect(await runRollback(plan, { runtime: fake.runtime, now })).toMatchObject({
      status: 'failed',
      failure: { kind: 'permanent' },
    });
    expect(fake.volumes.created).toEqual([]);
  });
});
