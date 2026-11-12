import type { JobHelpers } from 'graphile-worker';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as LinkChecksModule from '../../domain/reviews/link-checks.ts';

import type { Db } from '../../db/client.ts';
import { createCheckContentLinksTask, LINK_CONCURRENCY } from './check-content-links.ts';

// A leitura e a gravação são espionadas; o banco de verdade fica no contrato
// (link-checks.contract.test.ts). O fetch é falso: nenhum teste usa rede.
const mocks = vi.hoisted(() => ({ versionLinks: vi.fn(), recordLinkCheck: vi.fn() }));
vi.mock('../../domain/reviews/link-checks.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof LinkChecksModule>()),
  ...mocks,
}));

const tx = { tx: true };
const db = { transaction: (fn: (t: unknown) => unknown) => fn(tx) } as unknown as Db;
const NOW = Date.parse('2026-11-12T12:00:00Z');
const TARGET = { siteId: 'exemplo-a', contentId: 7, version: 2 };

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.recordLinkCheck.mockResolvedValue(undefined);
});

type Reply = number | Error | 'hang';

/** `fetch` falso: resposta por URL e método (`HEAD url` vence `url`); `hang` espera o abort. */
function fakeFetch(replies: Record<string, Reply>) {
  const calls: string[] = [];
  let active = 0;
  let peak = 0;
  const doFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${url}`);
    active++;
    peak = Math.max(peak, active);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1));
      const reply = replies[`${method} ${url}`] ?? replies[url];
      if (reply === undefined) throw new Error(`URL inesperada ${url}`);
      if (reply === 'hang') {
        return await new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason as Error));
        });
      }
      if (reply instanceof Error) throw reply;
      return new Response(null, { status: reply });
    } finally {
      active--;
    }
  }) as typeof fetch;
  return { doFetch, calls, peak: () => peak };
}

function run(doFetch: typeof fetch, payload: unknown = TARGET, timeoutMs = 50) {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const done = createCheckContentLinksTask({
    db,
    fetch: doFetch,
    timeoutMs,
    now: () => new Date(NOW),
  })(payload, { logger } as unknown as JobHelpers);
  return { done, logger };
}

const link = (blockN: number, url: string) => ({ blockN, url });

describe('check-content-links', () => {
  it('grava, na transação, o resultado de cada link: respondeu ou falhou com o motivo', async () => {
    mocks.versionLinks.mockResolvedValue([
      link(1, 'https://ok.example/'),
      link(1, 'https://sumiu.example/'),
      link(3, 'https://quebrado.example/'),
      link(4, 'https://redirecionado.example/'),
    ]);
    const { doFetch } = fakeFetch({
      'https://ok.example/': 200,
      'https://sumiu.example/': 404,
      'https://quebrado.example/': 500,
      'https://redirecionado.example/': 204,
    });

    await run(doFetch).done;

    expect(mocks.versionLinks).toHaveBeenCalledWith(db, TARGET);
    expect(mocks.recordLinkCheck).toHaveBeenCalledExactlyOnceWith(
      tx,
      TARGET,
      [
        { blockN: 1, url: 'https://ok.example/', ok: true },
        { blockN: 1, url: 'https://sumiu.example/', ok: false, reason: 'HTTP 404' },
        { blockN: 3, url: 'https://quebrado.example/', ok: false, reason: 'HTTP 500' },
        { blockN: 4, url: 'https://redirecionado.example/', ok: true },
      ],
      new Date(NOW),
    );
  });

  it('link sem resposta dentro do timeout e erro de rede viram falha com o motivo, sem lançar', async () => {
    mocks.versionLinks.mockResolvedValue([
      link(1, 'https://lento.example/'),
      link(2, 'https://nao-existe.example/'),
      link(2, 'https://recusado.example/'),
    ]);
    const { doFetch } = fakeFetch({
      'https://lento.example/': 'hang',
      'https://nao-existe.example/': new TypeError('fetch failed', {
        cause: { code: 'ENOTFOUND' },
      }),
      'https://recusado.example/': new TypeError('fetch failed'),
    });

    await run(doFetch, TARGET, 20).done;

    expect(mocks.recordLinkCheck.mock.calls[0]?.[2]).toEqual([
      { blockN: 1, url: 'https://lento.example/', ok: false, reason: 'Sem resposta em 0.02 s' },
      {
        blockN: 2,
        url: 'https://nao-existe.example/',
        ok: false,
        reason: 'Erro de rede: ENOTFOUND',
      },
      {
        blockN: 2,
        url: 'https://recusado.example/',
        ok: false,
        reason: 'Erro de rede: fetch failed',
      },
    ]);
  });

  it('servidor que não aceita HEAD (405 ou 501) é conferido de novo com GET', async () => {
    mocks.versionLinks.mockResolvedValue([
      link(1, 'https://sem-head.example/'),
      link(1, 'https://sem-head-501.example/'),
    ]);
    const { doFetch, calls } = fakeFetch({
      'HEAD https://sem-head.example/': 405,
      'GET https://sem-head.example/': 200,
      'HEAD https://sem-head-501.example/': 501,
      'GET https://sem-head-501.example/': 403,
    });

    await run(doFetch).done;

    expect(calls.sort()).toEqual([
      'GET https://sem-head-501.example/',
      'GET https://sem-head.example/',
      'HEAD https://sem-head-501.example/',
      'HEAD https://sem-head.example/',
    ]);
    expect(mocks.recordLinkCheck.mock.calls[0]?.[2]).toEqual([
      { blockN: 1, url: 'https://sem-head.example/', ok: true },
      { blockN: 1, url: 'https://sem-head-501.example/', ok: false, reason: 'HTTP 403' },
    ]);
  });

  it(`confere no máximo ${LINK_CONCURRENCY} links ao mesmo tempo, mantendo a ordem`, async () => {
    const links = Array.from({ length: 10 }, (_, i) => link(i + 1, `https://l${i}.example/`));
    mocks.versionLinks.mockResolvedValue(links);
    const { doFetch, peak } = fakeFetch(Object.fromEntries(links.map((l) => [l.url, 200])));

    await run(doFetch).done;

    expect(peak()).toBe(LINK_CONCURRENCY);
    expect(mocks.recordLinkCheck.mock.calls[0]?.[2]).toEqual(
      links.map((l) => ({ ...l, ok: true })),
    );
  });

  it('versão sem links externos conclui a checagem sem chamar a rede', async () => {
    mocks.versionLinks.mockResolvedValue([]);
    const { doFetch, calls } = fakeFetch({});

    await run(doFetch).done;

    expect(calls).toEqual([]);
    expect(mocks.recordLinkCheck).toHaveBeenCalledExactlyOnceWith(tx, TARGET, [], new Date(NOW));
  });

  it('versão que não existe mais é pulada sem gravar', async () => {
    mocks.versionLinks.mockResolvedValue(undefined);
    const { doFetch } = fakeFetch({});

    const { done, logger } = run(doFetch);
    await done;

    expect(mocks.recordLinkCheck).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('erro ao gravar lança, para o Graphile repetir', async () => {
    mocks.versionLinks.mockResolvedValue([]);
    mocks.recordLinkCheck.mockRejectedValue(new Error('banco fora'));

    await expect(run(fakeFetch({}).doFetch).done).rejects.toThrow('banco fora');
  });

  it.each([
    null,
    {},
    { ...TARGET, siteId: '' },
    { ...TARGET, contentId: 0 },
    { ...TARGET, version: 1.5 },
  ])('payload inválido %j lança sem ler a versão', async (payload) => {
    await expect(run(fakeFetch({}).doFetch, payload).done).rejects.toThrow(
      'Payload da checagem de links inválido',
    );
    expect(mocks.versionLinks).not.toHaveBeenCalled();
  });
});
