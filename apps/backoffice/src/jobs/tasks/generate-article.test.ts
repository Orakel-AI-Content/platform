import { RESOURCES } from '@orakel/content-model/v1';
import type { JobHelpers } from 'graphile-worker';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as RunsModule from '../../domain/generation/runs.ts';

import type { Db } from '../../db/client.ts';
import { FIXTURE_INVALID_TOPIC } from '../../domain/generation/fixture.ts';
import { resolveModel } from '../../domain/generation/generate.ts';
import type { PendingRun, RunOutcome } from '../../domain/generation/runs.ts';
import { createGenerateArticleTask, type GenerateArticleTaskDeps } from './generate-article.ts';

// A leitura e a gravação da execução são espionadas; o banco de verdade fica no contrato.
const mocks = vi.hoisted(() => ({ pendingRun: vi.fn(), finishRun: vi.fn() }));
vi.mock('../../domain/generation/runs.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof RunsModule>()),
  pendingRun: mocks.pendingRun,
  finishRun: mocks.finishRun,
}));

const run = (topic = 'Café coado em casa'): PendingRun => ({
  runId: 3,
  siteId: 'exemplo-a',
  input: {
    topic,
    editorialContext: 'Tom leve.',
    author: { id: 1, name: 'Ana' },
    categories: [{ id: 1, slug: 'receitas', name: 'Receitas' }],
    resources: RESOURCES,
    publishedAt: new Date('2026-11-03T12:00:00Z'),
  },
});

const helpers = { logger: { info: vi.fn(), warn: vi.fn() } } as unknown as JobHelpers;

function deps(fetch: typeof globalThis.fetch): GenerateArticleTaskDeps {
  return {
    db: {} as Db,
    generation: { model: resolveModel('fixture'), pricing: { fixture: { input: 1, output: 2 } } },
    api: { url: 'http://backoffice-web:3000', token: 'g'.repeat(32) },
    fetch,
  };
}

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

function outcome(): RunOutcome {
  expect(mocks.finishRun).toHaveBeenCalledOnce();
  const [, runId, value] = mocks.finishRun.mock.calls[0] as [unknown, number, RunOutcome];
  expect(runId).toBe(3);
  return value;
}

beforeEach(() => {
  mocks.pendingRun.mockReset();
  mocks.finishRun.mockReset().mockResolvedValue(true);
});

describe('generate-article', () => {
  it('cria o artigo pela rota interna com o token do gerador e grava a execução ok', async () => {
    mocks.pendingRun.mockResolvedValue(run());
    const fetch = vi.fn<typeof globalThis.fetch>(() => json(201, { id: 42, version: 1 }));

    await createGenerateArticleTask(deps(fetch))({ runId: 3 }, helpers);

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect((url as URL).href).toBe('http://backoffice-web:3000/api/internal/v1/contents');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${'g'.repeat(32)}`);
    const body = JSON.parse(init?.body as string) as {
      siteId: string;
      content: { title: string; taxonomyIds: number[]; seo?: { title?: string } };
    };
    expect(body.siteId).toBe('exemplo-a');
    expect(body.content).toMatchObject({
      title: 'Artigo de teste: Café coado em casa',
      taxonomyIds: [1],
    });
    expect(body.content.seo?.title).toBe('Artigo de teste');
    expect(outcome()).toMatchObject({
      status: 'ok',
      contentId: 42,
      call: {
        provider: 'fixture',
        model: 'fixture',
        usage: { inputTokens: 1000, outputTokens: 500 },
        costUsd: 0.002,
      },
    });
  });

  it('saída inválida termina em falha, sem chamar a rota', async () => {
    mocks.pendingRun.mockResolvedValue(run(FIXTURE_INVALID_TOPIC));
    const fetch = vi.fn<typeof globalThis.fetch>();

    await createGenerateArticleTask(deps(fetch))({ runId: 3 }, helpers);

    expect(fetch).not.toHaveBeenCalled();
    const value = outcome();
    expect(value.status).toBe('falha');
    expect(value.call?.prompt.user).toContain(FIXTURE_INVALID_TOPIC);
  });

  it('recusa da rota termina em falha com o status e os problemas devolvidos', async () => {
    mocks.pendingRun.mockResolvedValue(run());
    const issues = [{ code: 'slug.taken', message: 'Slug em uso', path: ['slug'] }];
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      json(422, { title: 'Conteúdo inválido', status: 422, issues }),
    );

    await createGenerateArticleTask(deps(fetch))({ runId: 3 }, helpers);

    expect(outcome()).toMatchObject({
      status: 'falha',
      issues: [
        { code: 'generation.api_refused', message: expect.stringContaining('422') as string },
        ...issues,
      ],
    });
  });

  it('rota inacessível termina em falha, sem lançar', async () => {
    mocks.pendingRun.mockResolvedValue(run());
    const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.reject(new Error('ECONNREFUSED')));

    await createGenerateArticleTask(deps(fetch))({ runId: 3 }, helpers);

    expect(outcome()).toMatchObject({
      status: 'falha',
      issues: [{ code: 'generation.api_unreachable' }],
    });
  });

  it('execução que já terminou é ignorada, sem chamar o modelo nem a rota', async () => {
    mocks.pendingRun.mockResolvedValue(undefined);
    const fetch = vi.fn<typeof globalThis.fetch>();

    await createGenerateArticleTask(deps(fetch))({ runId: 3 }, helpers);

    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.finishRun).not.toHaveBeenCalled();
  });

  it('payload sem runId lança', async () => {
    await expect(createGenerateArticleTask(deps(vi.fn()))({ runId: 'x' }, helpers)).rejects.toThrow(
      /Payload da geração inválido/,
    );
  });
});
