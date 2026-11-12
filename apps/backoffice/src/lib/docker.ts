// API do Docker por HTTP (fetch), sempre pelo docker-socket-proxy (ADR 0011 da raiz): só as
// rotas da lista do proxy. Sem cliente pronto: são nove chamadas, e assim nenhuma rota fora
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
  /** SITE_BUILDER_IMAGE (sem tag): única imagem que `pullImage` aceita baixar. */
  siteBuilderImage: string;
  pollMs?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Tag do Docker: sem digest, sem outro repositório. */
const TAG = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;

/** Mensagem de erro de uma linha do progresso do pull, se houver. */
function pullError(line: string): string | undefined {
  if (line.trim() === '') return undefined;
  let event: { error?: unknown; errorDetail?: { message?: unknown } };
  try {
    event = JSON.parse(line) as typeof event;
  } catch {
    return `progresso ilegível: ${line}`;
  }
  const message = event.errorDetail?.message ?? event.error;
  if (message === undefined) return undefined;
  return typeof message === 'string' ? message : JSON.stringify(message);
}

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

    async pullImage(image) {
      const prefix = `${options.siteBuilderImage}:`;
      const tag = image.startsWith(prefix) ? image.slice(prefix.length) : undefined;
      if (tag === undefined || !TAG.test(tag)) {
        throw new Error(`pull recusado: ${image} não é ${prefix}<tag>`);
      }
      const response = await call(
        'POST',
        `/images/create?fromImage=${encodeURIComponent(options.siteBuilderImage)}&tag=${encodeURIComponent(tag)}`,
      );
      // O Docker responde 200 e informa a falha no stream (uma linha JSON por evento): lê até o fim.
      const failed = (message: string) =>
        new RuntimeError(`Docker POST /images/create (${image}): ${message}`);
      const decoder = new TextDecoder();
      let pending = '';
      try {
        for await (const chunk of response.body ?? new ReadableStream<Uint8Array>()) {
          pending += decoder.decode(chunk, { stream: true });
          const lines = pending.split('\n');
          pending = lines.pop() ?? '';
          for (const line of lines) {
            const message = pullError(line);
            if (message !== undefined) throw failed(message);
          }
        }
      } catch (error) {
        if (error instanceof RuntimeError) throw error;
        throw new RuntimeError(
          `Docker POST /images/create (${image}) interrompido: ${String(error)}`,
          {
            cause: error,
          },
        );
      }
      const message = pullError(pending + decoder.decode());
      if (message !== undefined) throw failed(message);
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
