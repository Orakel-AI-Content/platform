import { describe, expect, it } from 'vitest';

import { failedFile, fakeRuntime, publishOk, renderOk } from './fake-runtime.ts';
import { runBuild, type BuildPlan } from './run-build.ts';

const plan: BuildPlan = {
  siteId: 'exemplo-a',
  release: 'local',
  image: 'site-builder:local',
  runId: 'exemplo-a-7-1',
  render: { env: { SITE_ID: 'exemplo-a' }, network: 'orakel-export', timeoutMs: 60_000 },
  publish: { env: { SITE_ID: 'exemplo-a' }, network: 'orakel-publish', timeoutMs: 60_000 },
};

let clock = 0;
const now = () => (clock += 100);

describe('runBuild', () => {
  it('render e publish com sucesso, cada um na sua rede, no mesmo volume', async () => {
    const fake = fakeRuntime({ render: { file: renderOk() }, publish: { file: publishOk() } });
    const outcome = await runBuild(plan, { runtime: fake.runtime, now });
    expect(outcome).toMatchObject({
      status: 'ok',
      render: { pendingChangeIds: [1, 2], pages: 12 },
      publish: { versionId: '20261001T120000Z-abcdef12' },
    });
    expect(fake.started.map((s) => [s.command[0], s.network, s.volume.name])).toEqual([
      ['render', 'orakel-export', 'orakel-build-exemplo-a-7-1'],
      ['publish', 'orakel-publish', 'orakel-build-exemplo-a-7-1'],
    ]);
  });

  it('sempre remove containers e volume, também na falha', async () => {
    const fake = fakeRuntime({ render: { exitCode: 10, file: failedFile('permanent', 'x') } });
    await runBuild(plan, { runtime: fake.runtime, now });
    expect(fake.removed).toEqual(['orakel-render-exemplo-a-7-1']);
    expect(fake.volumes.removed).toEqual(['orakel-build-exemplo-a-7-1']);
  });

  it('a falha vem do result.json; o publish não roda', async () => {
    const fake = fakeRuntime({
      render: { exitCode: 10, file: failedFile('permanent', 'Orçamento de JS estourado') },
    });
    const outcome = await runBuild(plan, { runtime: fake.runtime, now });
    expect(outcome).toMatchObject({
      status: 'failed',
      stage: 'render',
      failure: { kind: 'permanent', message: 'Orçamento de JS estourado' },
    });
    expect(fake.started).toHaveLength(1);
  });

  it('sem arquivo, o código de saída classifica (10 permanente, o resto transitório)', async () => {
    const permanent = await runBuild(plan, {
      runtime: fakeRuntime({ render: { exitCode: 10 } }).runtime,
      now,
    });
    const transient = await runBuild(plan, {
      runtime: fakeRuntime({ render: { exitCode: 137 } }).runtime,
      now,
    });
    expect(permanent).toMatchObject({ status: 'failed', failure: { kind: 'permanent' } });
    expect(transient).toMatchObject({ status: 'failed', failure: { kind: 'transient' } });
  });

  it('tempo estourado: mata o container, falha transitória', async () => {
    const fake = fakeRuntime({ render: { timedOut: true } });
    const outcome = await runBuild(plan, { runtime: fake.runtime, now });
    expect(fake.killed).toEqual(['orakel-render-exemplo-a-7-1']);
    expect(outcome).toMatchObject({ status: 'failed', failure: { kind: 'transient' } });
  });

  it('imagem ausente é permanente e nada é criado', async () => {
    const fake = fakeRuntime({ image: false });
    const outcome = await runBuild(plan, { runtime: fake.runtime, now });
    expect(outcome).toMatchObject({
      status: 'failed',
      stage: 'image',
      failure: { kind: 'permanent' },
    });
    expect(fake.volumes.created).toEqual([]);
  });

  it('erro do runtime é transitório, na etapa em que aconteceu', async () => {
    const outcome = await runBuild(plan, {
      runtime: fakeRuntime({ failOn: 'start' }).runtime,
      now,
    });
    expect(outcome).toMatchObject({
      status: 'failed',
      stage: 'render',
      failure: { kind: 'transient', message: 'render: proxy recusou' },
    });
  });

  it('falha no publish guarda o que o render produziu', async () => {
    const fake = fakeRuntime({
      render: { file: renderOk() },
      publish: {
        exitCode: 20,
        file: { ...failedFile('transient', 'edge-local 503'), release: undefined },
      },
    });
    const outcome = await runBuild(plan, { runtime: fake.runtime, now });
    expect(outcome).toMatchObject({
      status: 'failed',
      stage: 'publish',
      render: { pages: 12 },
    });
  });

  it('resultado de outro site é recusado', async () => {
    const fake = fakeRuntime({ render: { file: renderOk('exemplo-b') } });
    const outcome = await runBuild(plan, { runtime: fake.runtime, now });
    expect(outcome).toMatchObject({
      status: 'failed',
      stage: 'render',
      failure: { kind: 'transient' },
    });
  });
});
