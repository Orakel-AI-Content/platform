import { describe, expect, it } from 'vitest';

import { RuntimeError } from '../domain/builds/runtime.ts';
import { demux, dockerRuntime } from './docker.ts';

type Call = { method: string; url: string; body?: unknown };

/** fetch falso: responde pela rota, na ordem das respostas dadas para cada uma. */
function fakeFetch(routes: Record<string, Response[]>) {
  const calls: Call[] = [];
  const fn = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? 'GET';
    calls.push({
      method,
      url,
      ...(typeof init?.body === 'string' && { body: JSON.parse(init.body) as unknown }),
    });
    const key = `${method} ${new URL(url).pathname}`;
    const response = routes[key]?.shift();
    if (response === undefined) return Promise.reject(new Error(`rota inesperada: ${key}`));
    return Promise.resolve(response);
  }) as typeof fetch;
  return { fn, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const host = 'tcp://docker-socket-proxy:2375';
const siteBuilderImage = 'ghcr.io/orakel-ai-content/site-builder';

describe('dockerRuntime', () => {
  it('cria o container com rede, volume, limites e sem privilégios, e o inicia', async () => {
    const { fn, calls } = fakeFetch({
      'POST /containers/create': [json({ Id: 'abc' }, 201)],
      'POST /containers/abc/start': [new Response(null, { status: 204 })],
    });
    const id = await dockerRuntime({ host, siteBuilderImage, fetch: fn }).start({
      name: 'orakel-render-x',
      image: 'site-builder:local',
      command: ['render'],
      env: { SITE_ID: 'exemplo-a' },
      network: 'orakel-export',
      volume: { name: 'orakel-build-x', target: '/build' },
      limits: { cpus: 3, memoryBytes: 6 * 1024 ** 3, cpuShares: 256 },
      labels: { 'orakel.build': 'x' },
    });
    expect(id).toBe('abc');
    expect(calls[0]?.url).toBe(
      'http://docker-socket-proxy:2375/containers/create?name=orakel-render-x',
    );
    expect(calls[0]?.body).toMatchObject({
      Image: 'site-builder:local',
      Cmd: ['render'],
      Env: ['SITE_ID=exemplo-a'],
      HostConfig: {
        NetworkMode: 'orakel-export',
        Mounts: [{ Type: 'volume', Source: 'orakel-build-x', Target: '/build' }],
        NanoCpus: 3e9,
        Memory: 6 * 1024 ** 3,
        CpuShares: 256,
        CapDrop: ['ALL'],
        SecurityOpt: ['no-new-privileges:true'],
      },
    });
  });

  it('espera consultando o estado e devolve o código de saída', async () => {
    const { fn } = fakeFetch({
      'GET /containers/abc/json': [
        json({ State: { Running: true, ExitCode: 0 } }),
        json({ State: { Running: false, ExitCode: 10 } }),
      ],
    });
    const runtime = dockerRuntime({
      host,
      siteBuilderImage,
      fetch: fn,
      sleep: () => Promise.resolve(),
    });
    expect(await runtime.wait('abc', 60_000)).toEqual({ exitCode: 10 });
  });

  it('para de esperar no limite de tempo', async () => {
    let clock = 0;
    const { fn } = fakeFetch({
      'GET /containers/abc/json': Array.from({ length: 5 }, () =>
        json({ State: { Running: true, ExitCode: 0 } }),
      ),
    });
    const runtime = dockerRuntime({
      host,
      siteBuilderImage,
      fetch: fn,
      pollMs: 1000,
      now: () => clock,
      sleep: (ms) => {
        clock += ms;
        return Promise.resolve();
      },
    });
    expect(await runtime.wait('abc', 2500)).toEqual({ timedOut: true });
  });

  it('imagem ausente, arquivo ausente e remoção do que já não existe não são erro', async () => {
    const { fn } = fakeFetch({
      'GET /images/ghcr.io/orakel-ai-content/site-builder:local/json': [json({}, 404)],
      'GET /containers/abc/archive': [json({ message: 'no such file' }, 404)],
      'DELETE /containers/abc': [json({}, 404)],
      'DELETE /volumes/v': [json({}, 404)],
    });
    const runtime = dockerRuntime({ host, siteBuilderImage, fetch: fn });
    expect(await runtime.imageExists('ghcr.io/orakel-ai-content/site-builder:local')).toBe(false);
    expect(await runtime.readFile('abc', '/build/result.json')).toBeUndefined();
    await runtime.removeContainer('abc');
    await runtime.removeVolume('v');
  });

  it('lê o fim do log só por GET /containers/<id>/logs, sem os cabeçalhos dos quadros', async () => {
    const frame = (stream: number, text: string) => {
      const payload = new TextEncoder().encode(text);
      const header = new Uint8Array(8);
      header[0] = stream;
      new DataView(header.buffer).setUint32(4, payload.length);
      return [...header, ...payload];
    };
    const body = new Uint8Array([...frame(1, 'render: 12 páginas\n'), ...frame(2, 'erro: ç')]);
    const { fn, calls } = fakeFetch({
      'GET /containers/abc/logs': [new Response(body, { status: 200 })],
    });
    expect(await dockerRuntime({ host, siteBuilderImage, fetch: fn }).logsTail('abc', 200)).toBe(
      'render: 12 páginas\nerro: ç',
    );
    expect(calls).toEqual([
      {
        method: 'GET',
        url: 'http://docker-socket-proxy:2375/containers/abc/logs?stdout=1&stderr=1&tail=200',
      },
    ]);
  });

  it('log sem quadros (container com TTY) volta como texto puro', () => {
    expect(demux(new TextEncoder().encode('linha 1\nlinha 2'))).toBe('linha 1\nlinha 2');
  });

  it('recusa do proxy e rede fora viram RuntimeError (transitório)', async () => {
    const { fn } = fakeFetch({
      'POST /volumes/create': [new Response('Forbidden', { status: 403 })],
    });
    await expect(
      dockerRuntime({ host, siteBuilderImage, fetch: fn }).createVolume('v', {}),
    ).rejects.toBeInstanceOf(RuntimeError);
    const offline = (() => Promise.reject(new TypeError('fetch failed'))) as typeof fetch;
    await expect(
      dockerRuntime({ host, siteBuilderImage, fetch: offline }).imageExists('x'),
    ).rejects.toThrow(/Docker indisponível/);
  });

  describe('pullImage', () => {
    const ndjson = (...events: unknown[]) =>
      new Response(events.map((event) => `${JSON.stringify(event)}\n`).join(''), { status: 200 });

    it('baixa SITE_BUILDER_IMAGE:<tag> e lê o progresso até o fim', async () => {
      const { fn, calls } = fakeFetch({
        'POST /images/create': [
          ndjson(
            { status: 'Pulling from orakel-ai-content/site-builder', id: '1.4.0' },
            {
              status:
                'Status: Downloaded newer image for ghcr.io/orakel-ai-content/site-builder:1.4.0',
            },
          ),
        ],
      });
      await dockerRuntime({ host, siteBuilderImage, fetch: fn }).pullImage(
        'ghcr.io/orakel-ai-content/site-builder:1.4.0',
      );
      expect(calls.map((c) => [c.method, c.url])).toEqual([
        [
          'POST',
          'http://docker-socket-proxy:2375/images/create?fromImage=ghcr.io%2Forakel-ai-content%2Fsite-builder&tag=1.4.0',
        ],
      ]);
    });

    it.each([
      'ghcr.io/outro/site-builder:1.4.0',
      'ghcr.io/orakel-ai-content/site-builder-x:1.4.0',
      'ghcr.io/orakel-ai-content/site-builder',
      'ghcr.io/orakel-ai-content/site-builder:',
      'ghcr.io/orakel-ai-content/site-builder@sha256:abc',
      'ghcr.io/orakel-ai-content/site-builder:1.4.0&fromImage=alpine',
      'ghcr.io/orakel-ai-content/site-builder:1/../x',
    ])('recusa %s sem chamar o Docker', async (image) => {
      const { fn, calls } = fakeFetch({});
      await expect(
        dockerRuntime({ host, siteBuilderImage, fetch: fn }).pullImage(image),
      ).rejects.toThrow(/pull recusado/);
      expect(calls).toEqual([]);
    });

    it('erro no stream vira RuntimeError mesmo com HTTP 200', async () => {
      const { fn } = fakeFetch({
        'POST /images/create': [
          ndjson(
            { status: 'Pulling from orakel-ai-content/site-builder', id: '9.9.9' },
            { errorDetail: { message: 'manifest unknown' }, error: 'manifest unknown' },
          ),
        ],
      });
      const pull = dockerRuntime({ host, siteBuilderImage, fetch: fn }).pullImage(
        'ghcr.io/orakel-ai-content/site-builder:9.9.9',
      );
      await expect(pull).rejects.toBeInstanceOf(RuntimeError);
      await expect(pull).rejects.toThrow(/manifest unknown/);
    });

    it('erro na última linha sem quebra também é detectado', async () => {
      const { fn } = fakeFetch({
        'POST /images/create': [new Response('{"error":"toomanyrequests"}', { status: 200 })],
      });
      await expect(
        dockerRuntime({ host, siteBuilderImage, fetch: fn }).pullImage(
          'ghcr.io/orakel-ai-content/site-builder:1.4.0',
        ),
      ).rejects.toThrow(/toomanyrequests/);
    });

    it('recusa do proxy vira RuntimeError', async () => {
      const { fn } = fakeFetch({
        'POST /images/create': [new Response('Forbidden', { status: 403 })],
      });
      await expect(
        dockerRuntime({ host, siteBuilderImage, fetch: fn }).pullImage(
          'ghcr.io/orakel-ai-content/site-builder:1.4.0',
        ),
      ).rejects.toBeInstanceOf(RuntimeError);
    });
  });
});
