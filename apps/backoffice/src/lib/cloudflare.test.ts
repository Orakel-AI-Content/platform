import { describe, expect, it } from 'vitest';

import {
  cloudflareZoneChecker,
  edgeLocalZoneChecker,
  cloudflareWorkerRemover,
  edgeLocalWorkerRemover,
  workerRemoverFrom,
  zoneCheckerFrom,
  type ProviderFailure,
  type WorkerRemoval,
  type ZoneStatus,
} from './cloudflare.ts';

type Call = { url: URL; method: string; headers: Record<string, string> };

/** fetch falso: devolve as respostas na ordem e guarda as chamadas. */
function fakeFetch(...responses: (Response | Error)[]) {
  const calls: Call[] = [];
  const fn = ((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    calls.push({
      url,
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    const response = responses.shift();
    if (response === undefined) return Promise.reject(new Error('chamada inesperada'));
    return response instanceof Error ? Promise.reject(response) : Promise.resolve(response);
  }) as typeof fetch;
  return { fn, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const zones = (...result: { name: string; status: string }[]) =>
  json({ success: true, errors: [], messages: [], result });

const apiError = (status: number, message: string) =>
  json({ success: false, errors: [{ code: 10000, message }], result: null }, status);

const token = 'cf-zone-read-'.padEnd(40, 's');
const accountId = 'a'.repeat(32);
const domain = 'receitas.example.com';

function checker(...responses: (Response | Error)[]) {
  const fake = fakeFetch(...responses);
  return { ...fake, zone: cloudflareZoneChecker({ token, accountId, fetch: fake.fn }) };
}

/** Confere a falha e devolve a mensagem, que nunca traz o token. */
function expectFailure(
  status: ZoneStatus | WorkerRemoval,
  transient: boolean,
  secret = token,
): string {
  expect(status).toMatchObject({ kind: 'falha', transient });
  const message = (status as ProviderFailure).message;
  expect(message).not.toContain(secret);
  return message;
}

describe('cloudflareZoneChecker', () => {
  it('busca a zona pelo nome, filtrada pela conta, com o token só no cabeçalho', async () => {
    const { zone, calls } = checker(zones({ name: domain, status: 'active' }));
    await zone.check(domain);

    expect(`${calls[0]?.url.origin}${calls[0]?.url.pathname}`).toBe(
      'https://api.cloudflare.com/client/v4/zones',
    );
    expect(calls[0]?.url.searchParams.get('name')).toBe(domain);
    expect(calls[0]?.url.searchParams.get('account.id')).toBe(accountId);
    expect(calls[0]?.url.href).not.toContain(token);
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${token}`);
  });

  it('lista vazia é inexistente; active é ativa; outro status é pendente', async () => {
    const { zone } = checker(
      zones(),
      zones({ name: domain, status: 'active' }),
      zones({ name: domain, status: 'pending' }),
      zones({ name: domain, status: 'initializing' }),
    );

    expect(await zone.check(domain)).toEqual({ kind: 'inexistente' });
    expect(await zone.check(domain)).toEqual({ kind: 'ativa' });
    expect(await zone.check(domain)).toEqual({ kind: 'pendente', status: 'pending' });
    expect(await zone.check(domain)).toEqual({ kind: 'pendente', status: 'initializing' });
  });

  it('rede e falta de resposta são falha transitória, nunca pendente', async () => {
    const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    const { zone } = checker(new TypeError('fetch failed'), timeout);

    expect(expectFailure(await zone.check(domain), true)).toMatch(/Cloudflare indisponível/);
    expect(expectFailure(await zone.check(domain), true)).toMatch(/sem resposta no tempo limite/);
  });

  it('5xx e 429 são falha transitória', async () => {
    const { zone } = checker(
      apiError(502, 'Bad gateway'),
      apiError(429, 'Rate limited'),
      new Response('<html>erro</html>', { status: 503 }),
    );

    for (let i = 0; i < 3; i++) expectFailure(await zone.check(domain), true);
  });

  it('401 e 403 são falha definitiva com mensagem legível', async () => {
    const { zone } = checker(
      apiError(401, 'Invalid API Token'),
      apiError(403, 'Authentication error'),
    );

    expect(expectFailure(await zone.check(domain), false)).toMatch(
      /CLOUDFLARE_ZONE_READ_TOKEN está inválido ou expirou/,
    );
    expect(expectFailure(await zone.check(domain), false)).toMatch(/Zone: Read/);
  });

  it('resposta sem sucesso, fora do formato ou outro 4xx é falha definitiva', async () => {
    const { zone } = checker(
      json({ success: false, errors: [{ code: 1, message: 'boom' }], result: null }),
      new Response('não é json', { status: 200 }),
      json({ success: true, result: [{ name: domain }] }),
      apiError(400, 'Invalid account id'),
    );

    for (let i = 0; i < 4; i++) expectFailure(await zone.check(domain), false);
  });

  it('nenhuma mensagem repete o token, mesmo quando o erro o traz', async () => {
    const { zone } = checker(
      new TypeError(`fetch failed: Bearer ${token}`),
      apiError(500, `token ${token} recusado`),
      apiError(400, `token ${token} inválido`),
      new Response(`eco ${token}`, { status: 200 }),
    );

    expectFailure(await zone.check(domain), true);
    expectFailure(await zone.check(domain), true);
    expectFailure(await zone.check(domain), false);
    expectFailure(await zone.check(domain), false);
  });
});

describe('edgeLocalZoneChecker', () => {
  const edgeLocalUrl = 'http://edge-local:8081/';

  it('/healthz 200 é ativa, para qualquer domínio', async () => {
    const { fn, calls } = fakeFetch(json({ ready: true }));
    const zone = edgeLocalZoneChecker({ edgeLocalUrl, fetch: fn });

    expect(await zone.check(domain)).toEqual({ kind: 'ativa' });
    expect(calls[0]?.url.href).toBe('http://edge-local:8081/healthz');
  });

  it('503, erro de rede e falta de resposta são falha transitória', async () => {
    const { fn } = fakeFetch(
      json({ ready: false }, 503),
      new TypeError('fetch failed'),
      new DOMException('The operation was aborted due to timeout', 'TimeoutError'),
    );
    const zone = edgeLocalZoneChecker({ edgeLocalUrl, fetch: fn });

    expect(expectFailure(await zone.check(domain), true)).toMatch(/503/);
    expect(expectFailure(await zone.check(domain), true)).toMatch(/edge-local indisponível/);
    expect(expectFailure(await zone.check(domain), true)).toMatch(/sem resposta/);
  });
});

describe('zoneCheckerFrom', () => {
  it('escolhe o edge-local com DEPLOY_TARGET=local', async () => {
    const { fn, calls } = fakeFetch(json({ ready: true }));
    const zone = zoneCheckerFrom(
      { DEPLOY_TARGET: 'local', EDGE_LOCAL_URL: 'http://edge-local:8081' },
      { fetch: fn },
    );

    expect(await zone.check(domain)).toEqual({ kind: 'ativa' });
    expect(calls[0]?.url.pathname).toBe('/healthz');
  });

  it('escolhe a API da Cloudflare com DEPLOY_TARGET=cloudflare', async () => {
    const { fn, calls } = fakeFetch(zones({ name: domain, status: 'pending' }));
    const zone = zoneCheckerFrom(
      {
        DEPLOY_TARGET: 'cloudflare',
        CLOUDFLARE_ZONE_READ_TOKEN: token,
        CLOUDFLARE_ACCOUNT_ID: accountId,
      },
      { fetch: fn },
    );

    expect(await zone.check(domain)).toEqual({ kind: 'pendente', status: 'pending' });
    expect(calls[0]?.url.hostname).toBe('api.cloudflare.com');
  });

  it('lança sem as variáveis do modo (o env já as exige)', () => {
    expect(() => zoneCheckerFrom({ DEPLOY_TARGET: 'local' })).toThrow(/EDGE_LOCAL_URL/);
    expect(() => zoneCheckerFrom({ DEPLOY_TARGET: 'cloudflare' })).toThrow(
      /CLOUDFLARE_ZONE_READ_TOKEN/,
    );
  });
});

const deployToken = 'cf-deploy-'.padEnd(40, 'd');

function remover(...responses: (Response | Error)[]) {
  const fake = fakeFetch(...responses);
  return {
    ...fake,
    worker: cloudflareWorkerRemover({ token: deployToken, accountId, fetch: fake.fn }),
  };
}

describe('cloudflareWorkerRemover', () => {
  it('apaga o script workerName(site) da conta, com o token só no cabeçalho', async () => {
    const { worker, calls } = remover(json({ success: true, errors: [], result: null }));

    expect(await worker.remove('receitas')).toEqual({ kind: 'removido' });
    expect(calls[0]?.method).toBe('DELETE');
    expect(calls[0]?.url.href).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/orakel-receitas`,
    );
    expect(calls[0]?.url.searchParams.has('force')).toBe(false);
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${deployToken}`);
  });

  it('404 é Worker inexistente, que conta como sucesso', async () => {
    const { worker } = remover(apiError(404, 'workers.api.error.script_not_found'));
    expect(await worker.remove('receitas')).toEqual({ kind: 'inexistente' });
  });

  it('rede, falta de resposta, 429 e 5xx são falha transitória', async () => {
    const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    const { worker } = remover(
      new TypeError('fetch failed'),
      timeout,
      apiError(429, 'rate limited'),
      apiError(500, 'internal'),
      new Response('bad gateway', { status: 502 }),
    );
    for (let i = 0; i < 5; i += 1)
      expectFailure(await worker.remove('receitas'), true, deployToken);
  });

  it('401 e 403 são falha definitiva que nomeia o token de deploy', async () => {
    const { worker } = remover(
      apiError(401, 'Invalid API Token'),
      apiError(403, 'Authentication error'),
    );
    expect(expectFailure(await worker.remove('receitas'), false, deployToken)).toMatch(
      /CLOUDFLARE_API_TOKEN.*inválido/,
    );
    expect(expectFailure(await worker.remove('receitas'), false, deployToken)).toMatch(
      /Workers Scripts: Edit/,
    );
  });

  it('outro 4xx é falha definitiva com a mensagem da API', async () => {
    const { worker } = remover(apiError(400, 'script is bound by another worker'));
    expect(expectFailure(await worker.remove('receitas'), false, deployToken)).toMatch(
      /400.*bound by another worker/,
    );
  });

  it('nenhuma mensagem repete o token, mesmo quando o erro o traz', async () => {
    const { worker } = remover(
      new Error(`falhou com Bearer ${deployToken}`),
      apiError(400, `token ${deployToken} recusado`),
      new Response(`eco ${deployToken}`, { status: 500 }),
    );
    for (let i = 0; i < 3; i += 1) {
      expect(expectFailure(await worker.remove('receitas'), i !== 1, deployToken)).toContain('***');
    }
  });
});

describe('edgeLocalWorkerRemover', () => {
  const edgeLocalUrl = 'http://edge-local:8081/';

  it('DELETE /sites/<site>: 204 é removido', async () => {
    const { fn, calls } = fakeFetch(new Response(null, { status: 204 }));
    const worker = edgeLocalWorkerRemover({ edgeLocalUrl, fetch: fn });

    expect(await worker.remove('receitas')).toEqual({ kind: 'removido' });
    expect(calls[0]?.method).toBe('DELETE');
    expect(calls[0]?.url.href).toBe('http://edge-local:8081/sites/receitas');
  });

  it('rede, 409 e 5xx são transitórios; 400 é definitivo', async () => {
    const { fn } = fakeFetch(
      new TypeError('fetch failed'),
      json({ error: 'Outra operação em andamento para receitas' }, 409),
      json({ error: 'Erro no edge-local' }, 500),
      json({ error: 'Site inválido: Receitas' }, 400),
    );
    const worker = edgeLocalWorkerRemover({ edgeLocalUrl, fetch: fn });

    expectFailure(await worker.remove('receitas'), true);
    expectFailure(await worker.remove('receitas'), true);
    expectFailure(await worker.remove('receitas'), true);
    expect(expectFailure(await worker.remove('Receitas'), false)).toMatch(/400/);
  });
});

describe('workerRemoverFrom', () => {
  it('escolhe o edge-local com DEPLOY_TARGET=local', async () => {
    const { fn, calls } = fakeFetch(new Response(null, { status: 204 }));
    const worker = workerRemoverFrom(
      { DEPLOY_TARGET: 'local', EDGE_LOCAL_URL: 'http://edge-local:8081' },
      { fetch: fn },
    );

    expect(await worker.remove('receitas')).toEqual({ kind: 'removido' });
    expect(calls[0]?.url.hostname).toBe('edge-local');
  });

  it('escolhe a API da Cloudflare com DEPLOY_TARGET=cloudflare', async () => {
    const { fn, calls } = fakeFetch(apiError(404, 'not found'));
    const worker = workerRemoverFrom(
      {
        DEPLOY_TARGET: 'cloudflare',
        CLOUDFLARE_API_TOKEN: deployToken,
        CLOUDFLARE_ACCOUNT_ID: accountId,
      },
      { fetch: fn },
    );

    expect(await worker.remove('receitas')).toEqual({ kind: 'inexistente' });
    expect(calls[0]?.url.hostname).toBe('api.cloudflare.com');
  });

  it('lança sem as variáveis do modo (o env já as exige)', () => {
    expect(() => workerRemoverFrom({ DEPLOY_TARGET: 'local' })).toThrow(/EDGE_LOCAL_URL/);
    expect(() => workerRemoverFrom({ DEPLOY_TARGET: 'cloudflare' })).toThrow(
      /CLOUDFLARE_API_TOKEN/,
    );
  });
});
