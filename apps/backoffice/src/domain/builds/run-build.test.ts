import { describe, expect, it } from 'vitest';

import { failedFile, fakeRuntime, publishOk, renderOk } from './fake-runtime.ts';
import { SITE_WITHOUT_RELEASE } from './plan.ts';
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

  it('site sem versão: falha permanente na etapa image, sem tocar o runtime', async () => {
    const fake = fakeRuntime({ render: { file: renderOk() }, publish: { file: publishOk() } });
    const outcome = await runBuild(
      { ...plan, release: null, image: null },
      { runtime: fake.runtime, now },
    );
    expect(outcome).toEqual({
      status: 'failed',
      stage: 'image',
      failure: { kind: 'permanent', message: SITE_WITHOUT_RELEASE },
    });
    expect(fake.started).toEqual([]);
    expect(fake.pulled).toEqual([]);
    expect(fake.volumes.created).toEqual([]);
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

  it('imagem ausente: tenta o pull uma vez e, sem a imagem, falha permanente e nada é criado', async () => {
    const fake = fakeRuntime({ image: false });
    const outcome = await runBuild(plan, { runtime: fake.runtime, now });
    expect(fake.pulled).toEqual(['site-builder:local']);
    expect(outcome).toMatchObject({
      status: 'failed',
      stage: 'image',
      failure: { kind: 'permanent' },
    });
    expect(fake.volumes.created).toEqual([]);
  });

  it('imagem ausente que o pull traz segue para o render', async () => {
    const fake = fakeRuntime({
      image: false,
      pull: 'ok',
      render: { file: renderOk() },
      publish: { file: publishOk() },
    });
    const outcome = await runBuild(plan, { runtime: fake.runtime, now });
    expect(fake.pulled).toEqual(['site-builder:local']);
    expect(outcome).toMatchObject({ status: 'ok' });
  });

  it('erro no pull é transitório, na etapa image', async () => {
    const fake = fakeRuntime({ image: false, pull: 'error' });
    const outcome = await runBuild(plan, { runtime: fake.runtime, now });
    expect(fake.pulled).toHaveLength(1);
    expect(outcome).toMatchObject({
      status: 'failed',
      stage: 'image',
      failure: { kind: 'transient', message: 'image: toomanyrequests' },
    });
    expect(fake.started).toEqual([]);
  });

  it('imagem recusada pelo registry é permanente, com a orientação de conferir a release', async () => {
    const fake = fakeRuntime({ image: false, pull: 'unavailable' });
    const outcome = await runBuild(plan, { runtime: fake.runtime, now });
    expect(fake.pulled).toHaveLength(1);
    expect(outcome).toMatchObject({
      status: 'failed',
      stage: 'image',
      failure: {
        kind: 'permanent',
        message: expect.stringMatching(/denied.*Confira a release em Releases/) as unknown,
      },
    });
    expect(fake.started).toEqual([]);
  });

  it('imagem presente não tenta o pull', async () => {
    const fake = fakeRuntime({ render: { file: renderOk() }, publish: { file: publishOk() } });
    await runBuild(plan, { runtime: fake.runtime, now });
    expect(fake.pulled).toEqual([]);
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

  it('avisa cada troca de etapa, na ordem', async () => {
    const stages: string[] = [];
    const fake = fakeRuntime({ render: { file: renderOk() }, publish: { file: publishOk() } });
    await runBuild(plan, {
      runtime: fake.runtime,
      now,
      onStage: (stage) => {
        stages.push(stage);
        return Promise.resolve();
      },
    });
    expect(stages).toEqual(['image', 'render', 'publish']);
  });

  it('erro ao avisar a etapa só vai para o log', async () => {
    const logs: string[] = [];
    const fake = fakeRuntime({ render: { file: renderOk() }, publish: { file: publishOk() } });
    const outcome = await runBuild(plan, {
      runtime: fake.runtime,
      now,
      log: (msg) => logs.push(msg),
      onStage: () => Promise.reject(new Error('banco fora')),
    });
    expect(outcome.status).toBe('ok');
    expect(logs).toHaveLength(3);
  });

  it('na falha, guarda o fim do log do container da etapa, lido antes de removê-lo', async () => {
    const fake = fakeRuntime({
      render: { file: renderOk(), log: 'render ok' },
      publish: { exitCode: 20, log: 'publicando\nedge-local 503' },
    });
    const outcome = await runBuild(plan, { runtime: fake.runtime, now });
    expect(outcome).toMatchObject({
      status: 'failed',
      stage: 'publish',
      logTail: 'publicando\nedge-local 503',
    });
    expect(fake.removed).toHaveLength(2);
  });

  it('o fim do log fica em 200 linhas e 16 KiB', async () => {
    const lines = Array.from({ length: 500 }, (_, i) => `linha ${i} ${'x'.repeat(100)}`);
    const fake = fakeRuntime({ render: { exitCode: 1, log: lines.join('\n') } });
    const outcome = await runBuild(plan, { runtime: fake.runtime, now });
    const logTail = outcome.status === 'failed' ? (outcome.logTail ?? '') : '';
    expect(new TextEncoder().encode(logTail).length).toBeLessThanOrEqual(16 * 1024);
    expect(logTail.split('\n').length).toBeLessThanOrEqual(200);
    expect(logTail.endsWith(lines[499] ?? '')).toBe(true);
  });

  it('erro ao ler o log não muda o resultado nem a classificação', async () => {
    const outcome = await runBuild(plan, {
      runtime: fakeRuntime({ render: { exitCode: 10 }, failOn: 'logs' }).runtime,
      now,
    });
    expect(outcome).toMatchObject({
      status: 'failed',
      stage: 'render',
      failure: { kind: 'permanent', message: 'render saiu com 10 sem um result.json válido' },
    });
    expect(outcome).not.toHaveProperty('logTail');
  });

  it('sem container (imagem ausente), não há log', async () => {
    const outcome = await runBuild(plan, { runtime: fakeRuntime({ image: false }).runtime, now });
    expect(outcome).not.toHaveProperty('logTail');
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

  describe('cancelamento', () => {
    it('pedido durante a espera: mata o container, termina cancelled e remove containers e volume', async () => {
      const fake = fakeRuntime({ render: { running: true } });
      let asked = 0;
      const outcome = await runBuild(plan, {
        runtime: fake.runtime,
        now,
        // Não há pedido nas consultas antes do render; aparece na espera.
        cancelRequested: () => Promise.resolve(++asked > 2),
      });
      expect(outcome).toMatchObject({ status: 'cancelled', stage: 'render' });
      expect(outcome).not.toHaveProperty('logTail');
      expect(fake.killed).toEqual(['orakel-render-exemplo-a-7-1']);
      expect(fake.removed).toEqual(['orakel-render-exemplo-a-7-1']);
      expect(fake.volumes.removed).toEqual(['orakel-build-exemplo-a-7-1']);
      expect(fake.started).toHaveLength(1);
    });

    it('pedido visto depois do render impede o publish e guarda o que o render produziu', async () => {
      const fake = fakeRuntime({ render: { file: renderOk() }, publish: { file: publishOk() } });
      let asked = 0;
      const outcome = await runBuild(plan, {
        runtime: fake.runtime,
        now,
        cancelRequested: () => Promise.resolve(++asked > 1),
      });
      expect(outcome).toMatchObject({
        status: 'cancelled',
        stage: 'publish',
        render: { pages: 12 },
      });
      expect(fake.started.map((s) => s.command[0])).toEqual(['render']);
      expect(fake.killed).toEqual([]);
      expect(fake.volumes.removed).toEqual(['orakel-build-exemplo-a-7-1']);
    });

    it('pedido antes do render: nenhum container nem volume é criado', async () => {
      const fake = fakeRuntime({ render: { file: renderOk() } });
      const outcome = await runBuild(plan, {
        runtime: fake.runtime,
        now,
        cancelRequested: () => Promise.resolve(true),
      });
      expect(outcome).toMatchObject({ status: 'cancelled', stage: 'render' });
      expect(fake.started).toEqual([]);
      expect(fake.volumes.created).toEqual([]);
    });

    it('container que sai antes de o pedido ser visto fecha com o resultado real', async () => {
      const fake = fakeRuntime({ render: { file: renderOk() }, publish: { file: publishOk() } });
      let asked = 0;
      const outcome = await runBuild(plan, {
        runtime: fake.runtime,
        now,
        // Pedido só depois da última consulta (antes do publish).
        cancelRequested: () => Promise.resolve(++asked > 2),
      });
      expect(outcome.status).toBe('ok');
      const failing = fakeRuntime({ render: { exitCode: 10 } });
      const failed = await runBuild(plan, {
        runtime: failing.runtime,
        now,
        cancelRequested: () => Promise.resolve(false),
      });
      expect(failed).toMatchObject({ status: 'failed', stage: 'render' });
    });

    it('a espera é feita em fatias e o prazo da etapa continua valendo', async () => {
      const fake = fakeRuntime({ render: { running: true } });
      const waits: number[] = [];
      const wait = fake.runtime.wait.bind(fake.runtime);
      fake.runtime.wait = (id, ms) => {
        waits.push(ms);
        return wait(id, ms);
      };
      let t = 0;
      const outcome = await runBuild(
        { ...plan, render: { ...plan.render, timeoutMs: 12_000 } },
        {
          runtime: fake.runtime,
          // Cada fatia "dura" o que pediu.
          now: () => (t += waits.at(-1) ?? 0),
          cancelRequested: () => Promise.resolve(false),
        },
      );
      expect(waits.every((ms) => ms <= 5_000)).toBe(true);
      expect(outcome).toMatchObject({ status: 'failed', failure: { kind: 'transient' } });
      expect(fake.killed).toEqual(['orakel-render-exemplo-a-7-1']);
    });

    it('erro ao ler o pedido só vai para o log e o build segue', async () => {
      const logs: string[] = [];
      const fake = fakeRuntime({ render: { file: renderOk() }, publish: { file: publishOk() } });
      const outcome = await runBuild(plan, {
        runtime: fake.runtime,
        now,
        log: (msg) => logs.push(msg),
        cancelRequested: () => Promise.reject(new Error('banco fora')),
      });
      expect(outcome.status).toBe('ok');
      expect(logs.some((m) => m.includes('banco fora'))).toBe(true);
    });
  });
});
