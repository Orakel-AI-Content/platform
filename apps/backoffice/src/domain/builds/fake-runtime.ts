// Runtime de containers falso para os testes do build: cada etapa (render, publish) tem o
// código de saída, os arquivos que deixa no volume e se estoura o tempo.
import type { ContainerRuntime, ContainerSpec } from './runtime.ts';

export type FakeStage = { exitCode?: number; file?: unknown; timedOut?: boolean };

export function fakeRuntime(options: {
  image?: boolean;
  render?: FakeStage;
  publish?: FakeStage;
  failOn?: 'createVolume' | 'start';
}) {
  const started: ContainerSpec[] = [];
  const removed: string[] = [];
  const volumes = { created: [] as string[], removed: [] as string[] };
  const killed: string[] = [];
  const stageOf = (id: string) =>
    id.startsWith('orakel-render') ? options.render : options.publish;

  const runtime: ContainerRuntime = {
    imageExists: () => Promise.resolve(options.image ?? true),
    createVolume(name) {
      if (options.failOn === 'createVolume') return Promise.reject(new Error('daemon fora'));
      volumes.created.push(name);
      return Promise.resolve();
    },
    start(spec) {
      if (options.failOn === 'start') return Promise.reject(new Error('proxy recusou'));
      started.push(spec);
      return Promise.resolve(spec.name);
    },
    wait(id) {
      const stage = stageOf(id);
      return Promise.resolve(
        stage?.timedOut ? { timedOut: true as const } : { exitCode: stage?.exitCode ?? 0 },
      );
    },
    kill(id) {
      killed.push(id);
      return Promise.resolve();
    },
    readFile(id) {
      const file = stageOf(id)?.file;
      return Promise.resolve(file === undefined ? undefined : JSON.stringify(file));
    },
    removeContainer(id) {
      removed.push(id);
      return Promise.resolve();
    },
    removeVolume(name) {
      volumes.removed.push(name);
      return Promise.resolve();
    },
  };
  return { runtime, started, removed, volumes, killed };
}

export const renderOk = (site = 'exemplo-a', pendingChangeIds: number[] = [1, 2]) => ({
  formatVersion: 1,
  status: 'ok',
  site,
  release: 'local',
  durationMs: 1000,
  pendingChangeIds,
  pages: 12,
  files: 43,
  redirectUsage: { static: 0, dynamic: 0, limits: { static: 2000, dynamic: 100 }, alert: false },
});

export const publishOk = (site = 'exemplo-a') => ({
  formatVersion: 1,
  status: 'ok',
  site,
  target: 'local',
  versionId: '20261001T120000Z-abcdef12',
  cacheKey: `${site}/20261001T120000Z-abcdef12.tar.gz`,
  durationMs: 500,
});

export const failedFile = (
  kind: 'permanent' | 'transient',
  message: string,
  site = 'exemplo-a',
) => ({
  formatVersion: 1,
  status: 'failed',
  site,
  release: 'local',
  durationMs: 10,
  failure: { kind, message },
});
