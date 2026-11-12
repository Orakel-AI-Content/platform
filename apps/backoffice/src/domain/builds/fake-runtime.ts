// Runtime de containers falso para os testes do build: cada etapa (render, publish, rollback) tem o
// código de saída, os arquivos que deixa no volume, o log que escreve, se estoura o tempo e se
// fica rodando até ser morto.
import type { ContainerRuntime, ContainerSpec } from './runtime.ts';

export type FakeStage = {
  exitCode?: number;
  file?: unknown;
  timedOut?: boolean;
  log?: string;
  /** Fica rodando (cada `wait` estoura o tempo) até o `kill`; morto, sai com 137. */
  running?: boolean;
};

export function fakeRuntime(options: {
  /** A imagem está no host? */
  image?: boolean;
  /** O pull traz a imagem (`ok`), não traz (`absent`) ou lança (`error`). Padrão: `absent`. */
  pull?: 'ok' | 'absent' | 'error';
  render?: FakeStage;
  publish?: FakeStage;
  rollback?: FakeStage;
  failOn?: 'createVolume' | 'start' | 'logs';
}) {
  const started: ContainerSpec[] = [];
  const removed: string[] = [];
  const volumes = { created: [] as string[], removed: [] as string[] };
  const killed: string[] = [];
  const pulled: string[] = [];
  const tagged: { source: string; target: string }[] = [];
  let present = options.image ?? true;
  const stageOf = (id: string) =>
    id.startsWith('orakel-render')
      ? options.render
      : id.startsWith('orakel-rollback')
        ? options.rollback
        : options.publish;

  const runtime: ContainerRuntime = {
    imageExists: () => Promise.resolve(present),
    pullImage(image) {
      pulled.push(image);
      if (options.pull === 'error') return Promise.reject(new Error('manifest unknown'));
      if (options.pull === 'ok') present = true;
      return Promise.resolve();
    },
    tagImage(source, target) {
      tagged.push({ source, target });
      present = true;
      return Promise.resolve();
    },
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
      if (stage?.running) {
        return Promise.resolve(
          killed.includes(id) ? { exitCode: 137 } : { timedOut: true as const },
        );
      }
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
    logsTail(id, lines) {
      if (options.failOn === 'logs') return Promise.reject(new Error('proxy recusou'));
      // Como o Docker: container já removido não tem log.
      if (removed.includes(id)) return Promise.reject(new Error(`no such container: ${id}`));
      const log = stageOf(id)?.log ?? '';
      return Promise.resolve(log.split('\n').slice(-lines).join('\n'));
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
  return { runtime, started, removed, volumes, killed, pulled, tagged };
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

export const rollbackOk = (site = 'exemplo-a', versionId = '20261001T120000Z-abcdef12') => ({
  formatVersion: 1,
  status: 'ok',
  site,
  target: 'local',
  versionId,
  durationMs: 200,
});

export const failedFile = (
  kind: 'permanent' | 'transient',
  message: string,
  site = 'exemplo-a',
  culprit?: { origin: string; reference: string },
) => ({
  formatVersion: 1,
  status: 'failed',
  site,
  release: 'local',
  durationMs: 10,
  failure: { kind, message, ...(culprit && { culprit }) },
});
