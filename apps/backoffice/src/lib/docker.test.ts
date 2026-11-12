import { describe, expect, it } from 'vitest';

import { ImageUnavailableError, RuntimeError } from '../domain/builds/runtime.ts';
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
            { errorDetail: { message: 'toomanyrequests' }, error: 'toomanyrequests' },
          ),
        ],
      });
      const pull = dockerRuntime({ host, siteBuilderImage, fetch: fn }).pullImage(
        'ghcr.io/orakel-ai-content/site-builder:9.9.9',
      );
      await expect(pull).rejects.toBeInstanceOf(RuntimeError);
      await expect(pull).rejects.toThrow(/toomanyrequests/);
    });

    it('imagem inexistente no stream vira ImageUnavailableError', async () => {
      const { fn } = fakeFetch({
        'POST /images/create': [
          ndjson({ errorDetail: { message: 'manifest unknown' }, error: 'manifest unknown' }),
        ],
      });
      const pull = dockerRuntime({ host, siteBuilderImage, fetch: fn }).pullImage(
        'ghcr.io/orakel-ai-content/site-builder:9.9.9',
      );
      await expect(pull).rejects.toBeInstanceOf(ImageUnavailableError);
      await expect(pull).rejects.toThrow(/manifest unknown/);
    });

    it('registry que nega o acesso (HTTP 500 denied) vira ImageUnavailableError', async () => {
      const { fn } = fakeFetch({
        'POST /images/create': [json({ message: 'error from registry: denied\ndenied' }, 500)],
      });
      const pull = dockerRuntime({ host, siteBuilderImage, fetch: fn }).pullImage(
        'ghcr.io/orakel-ai-content/site-builder:1.0.1',
      );
      await expect(pull).rejects.toBeInstanceOf(ImageUnavailableError);
      await expect(pull).rejects.toThrow(/denied/);
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

  describe('tagImage', () => {
    it('etiqueta SITE_BUILDER_IMAGE:<origem> como SITE_BUILDER_IMAGE:<alvo>', async () => {
      const { fn, calls } = fakeFetch({
        'POST /images/ghcr.io/orakel-ai-content/site-builder:local/tag': [
          new Response(null, { status: 201 }),
        ],
      });
      await dockerRuntime({ host, siteBuilderImage, fetch: fn }).tagImage(
        'ghcr.io/orakel-ai-content/site-builder:local',
        'ghcr.io/orakel-ai-content/site-builder:1.4.0',
      );
      expect(calls.map((c) => [c.method, c.url])).toEqual([
        [
          'POST',
          'http://docker-socket-proxy:2375/images/ghcr.io/orakel-ai-content/site-builder:local/tag?repo=ghcr.io%2Forakel-ai-content%2Fsite-builder&tag=1.4.0',
        ],
      ]);
    });

    it.each([
      ['ghcr.io/outro/site-builder:local', 'ghcr.io/orakel-ai-content/site-builder:1.4.0'],
      ['ghcr.io/orakel-ai-content/site-builder:local', 'ghcr.io/outro/site-builder:1.4.0'],
      ['ghcr.io/orakel-ai-content/site-builder:local', 'ghcr.io/orakel-ai-content/site-builder'],
      [
        'ghcr.io/orakel-ai-content/site-builder:local',
        'ghcr.io/orakel-ai-content/site-builder:1.4.0&repo=alpine',
      ],
      ['ghcr.io/orakel-ai-content/site-builder:1/../x', 'ghcr.io/orakel-ai-content/site-builder:1'],
    ])('recusa %s → %s sem chamar o Docker', async (source, target) => {
      const { fn, calls } = fakeFetch({});
      await expect(
        dockerRuntime({ host, siteBuilderImage, fetch: fn }).tagImage(source, target),
      ).rejects.toThrow(/tag recusado/);
      expect(calls).toEqual([]);
    });

    it('origem ausente (404) ou recusa do proxy vira RuntimeError', async () => {
      const { fn } = fakeFetch({
        'POST /images/ghcr.io/orakel-ai-content/site-builder:local/tag': [
          json({ message: 'No such image' }, 404),
        ],
      });
      await expect(
        dockerRuntime({ host, siteBuilderImage, fetch: fn }).tagImage(
          'ghcr.io/orakel-ai-content/site-builder:local',
          'ghcr.io/orakel-ai-content/site-builder:1.4.0',
        ),
      ).rejects.toThrow(RuntimeError);
    });
  });

  describe('startService', () => {
    const service = (image = 'ghcr.io/orakel-ai-content/site-builder:1.4.0') => ({
      name: 'orakel-preview-1.4.0',
      image,
      command: ['ssr'],
      env: { PORT: '4321' },
      networks: [
        { name: 'orakel-internal', aliases: ['blog-preview'] },
        { name: 'orakel-export', aliases: ['blog-preview'] },
      ],
      healthcheck: {
        test: ['CMD', 'node', '-e', '0'],
        intervalMs: 10_000,
        timeoutMs: 5000,
        retries: 12,
      },
      labels: { 'orakel.preview': '1.4.0' },
    });

    it('cria pela API 1.44 nas duas redes, com apelido, healthcheck e restart, e o inicia', async () => {
      const { fn, calls } = fakeFetch({
        'POST /v1.44/containers/create': [json({ Id: 'svc' }, 201)],
        'POST /containers/svc/start': [new Response(null, { status: 204 })],
      });
      const id = await dockerRuntime({ host, siteBuilderImage, fetch: fn }).startService(service());
      expect(id).toBe('svc');
      expect(calls.map((c) => [c.method, c.url])).toEqual([
        [
          'POST',
          'http://docker-socket-proxy:2375/v1.44/containers/create?name=orakel-preview-1.4.0',
        ],
        ['POST', 'http://docker-socket-proxy:2375/containers/svc/start'],
      ]);
      expect(calls[0]?.body).toEqual({
        Image: 'ghcr.io/orakel-ai-content/site-builder:1.4.0',
        Cmd: ['ssr'],
        Env: ['PORT=4321'],
        Labels: { 'orakel.preview': '1.4.0' },
        Healthcheck: {
          Test: ['CMD', 'node', '-e', '0'],
          Interval: 10e9,
          Timeout: 5e9,
          Retries: 12,
        },
        HostConfig: {
          NetworkMode: 'orakel-internal',
          RestartPolicy: { Name: 'unless-stopped' },
          CapDrop: ['ALL'],
          SecurityOpt: ['no-new-privileges:true'],
        },
        NetworkingConfig: {
          EndpointsConfig: {
            'orakel-internal': { Aliases: ['blog-preview'] },
            'orakel-export': { Aliases: ['blog-preview'] },
          },
        },
      });
    });

    it.each([
      'ghcr.io/outro/site-builder:1.4.0',
      'ghcr.io/orakel-ai-content/site-builder',
      'ghcr.io/orakel-ai-content/site-builder@sha256:abc',
      'alpine:3',
    ])('recusa %s sem chamar o Docker', async (image) => {
      const { fn, calls } = fakeFetch({});
      await expect(
        dockerRuntime({ host, siteBuilderImage, fetch: fn }).startService(service(image)),
      ).rejects.toThrow(/serviço recusado/);
      expect(calls).toEqual([]);
    });

    it('recusa serviço sem rede sem chamar o Docker', async () => {
      const { fn, calls } = fakeFetch({});
      await expect(
        dockerRuntime({ host, siteBuilderImage, fetch: fn }).startService({
          ...service(),
          networks: [],
        }),
      ).rejects.toThrow(/sem rede/);
      expect(calls).toEqual([]);
    });

    it('Engine sem a API 1.44 vira RuntimeError com o motivo do daemon', async () => {
      const { fn } = fakeFetch({
        'POST /v1.44/containers/create': [
          json(
            { message: 'client version 1.44 is too new. Maximum supported API version is 1.43' },
            400,
          ),
        ],
      });
      const start = dockerRuntime({ host, siteBuilderImage, fetch: fn }).startService(service());
      await expect(start).rejects.toBeInstanceOf(RuntimeError);
      await expect(start).rejects.toThrow(/too new/);
    });
  });

  describe('health', () => {
    it.each([
      [{ Running: true, Health: { Status: 'starting' } }, 'starting'],
      [{ Running: true, Health: { Status: 'healthy' } }, 'healthy'],
      [{ Running: true, Health: { Status: 'unhealthy' } }, 'unhealthy'],
      [{ Running: false, Health: { Status: 'healthy' } }, 'unhealthy'],
      [{ Running: true, Health: { Status: 'none' } }, 'unhealthy'],
      [{ Running: true }, 'unhealthy'],
    ])('estado %j → %s', async (state, expected) => {
      const { fn, calls } = fakeFetch({ 'GET /containers/svc/json': [json({ State: state })] });
      expect(await dockerRuntime({ host, siteBuilderImage, fetch: fn }).health('svc')).toBe(
        expected,
      );
      expect(calls.map((c) => [c.method, c.url])).toEqual([
        ['GET', 'http://docker-socket-proxy:2375/containers/svc/json'],
      ]);
    });

    it('container inexistente (404) é absent, sem erro', async () => {
      const { fn } = fakeFetch({
        'GET /containers/svc/json': [json({ message: 'No such container' }, 404)],
      });
      expect(await dockerRuntime({ host, siteBuilderImage, fetch: fn }).health('svc')).toBe(
        'absent',
      );
    });

    it('recusa do proxy vira RuntimeError', async () => {
      const { fn } = fakeFetch({
        'GET /containers/svc/json': [new Response('Forbidden', { status: 403 })],
      });
      await expect(
        dockerRuntime({ host, siteBuilderImage, fetch: fn }).health('svc'),
      ).rejects.toBeInstanceOf(RuntimeError);
    });
  });
});
