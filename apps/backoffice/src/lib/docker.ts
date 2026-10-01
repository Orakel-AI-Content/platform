// API do Docker por HTTP (fetch), sempre pelo docker-socket-proxy (ADR 0011 da raiz): só as
// rotas da lista do proxy. Sem cliente pronto: são oito chamadas, e assim nenhuma rota fora
// da lista entra por engano. O fim do container é acompanhado por consulta periódica, sem
// conexão longa (o render pode passar dos limites de tempo do fetch).
import {
  RuntimeError,
  type ContainerRuntime,
  type ContainerSpec,
  type WaitResult,
} from '../domain/builds/runtime.ts';
import { firstTarFile } from './tar.ts';

type Options = {
  /** DOCKER_HOST: tcp://docker-socket-proxy:2375. */
  host: string;
  pollMs?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function dockerRuntime(options: Options): ContainerRuntime {
  const base = options.host.replace(/^tcp:\/\//, 'http://');
  const doFetch = options.fetch ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  const pollMs = options.pollMs ?? 2000;

  async function call(
    method: string,
    path: string,
    body?: unknown,
    accept: number[] = [],
  ): Promise<Response> {
    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, {
        method,
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      throw new RuntimeError(`Docker indisponível (${method} ${path}): ${String(error)}`, {
        cause: error,
      });
    }
    if (response.ok || accept.includes(response.status)) return response;
    const text = await response.text().catch(() => '');
    const message = (() => {
      try {
        return (JSON.parse(text) as { message?: string }).message ?? text;
      } catch {
        return text;
      }
    })();
    throw new RuntimeError(`Docker ${method} ${path} → ${response.status}: ${message}`);
  }

  async function state(id: string) {
    const response = await call('GET', `/containers/${id}/json`);
    const info = (await response.json()) as { State: { Running: boolean; ExitCode: number } };
    return info.State;
  }

  return {
    async imageExists(image) {
      const response = await call('GET', `/images/${image}/json`, undefined, [404]);
      await response.body?.cancel();
      return response.status !== 404;
    },

    async createVolume(name, labels) {
      await call('POST', '/volumes/create', { Name: name, Labels: labels });
    },

    async start(spec: ContainerSpec) {
      const response = await call('POST', `/containers/create?name=${spec.name}`, {
        Image: spec.image,
        Cmd: spec.command,
        Env: Object.entries(spec.env).map(([key, value]) => `${key}=${value}`),
        Labels: spec.labels,
        HostConfig: {
          NetworkMode: spec.network,
          Mounts: [{ Type: 'volume', Source: spec.volume.name, Target: spec.volume.target }],
          ...(spec.limits && {
            NanoCpus: Math.round(spec.limits.cpus * 1e9),
            Memory: spec.limits.memoryBytes,
            CpuShares: spec.limits.cpuShares,
          }),
          CapDrop: ['ALL'],
          SecurityOpt: ['no-new-privileges:true'],
        },
      });
      const { Id: id } = (await response.json()) as { Id: string };
      await call('POST', `/containers/${id}/start`);
      return id;
    },

    async wait(id, timeoutMs): Promise<WaitResult> {
      const deadline = now() + timeoutMs;
      for (;;) {
        const current = await state(id);
        if (!current.Running) return { exitCode: current.ExitCode };
        if (now() >= deadline) return { timedOut: true };
        await sleep(pollMs);
      }
    },

    async kill(id) {
      // 409: já terminou.
      await call('POST', `/containers/${id}/kill`, undefined, [409]);
    },

    async readFile(id, path) {
      const response = await call(
        'GET',
        `/containers/${id}/archive?path=${encodeURIComponent(path)}`,
        undefined,
        [404],
      );
      if (response.status === 404) {
        await response.body?.cancel();
        return undefined;
      }
      const file = firstTarFile(new Uint8Array(await response.arrayBuffer()));
      return file === undefined ? undefined : new TextDecoder().decode(file);
    },

    async removeContainer(id) {
      await call('DELETE', `/containers/${id}?force=true`, undefined, [404]);
    },

    async removeVolume(name) {
      await call('DELETE', `/volumes/${name}?force=true`, undefined, [404]);
    },
  };
}
