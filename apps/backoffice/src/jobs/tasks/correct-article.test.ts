import { RESOURCES } from '@orakel/content-model/v1';
import type { JobHelpers } from 'graphile-worker';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as RunsModule from '../../domain/generation/runs.ts';

import type { Db } from '../../db/client.ts';
import type { ContentData } from '../../db/schema/index.ts';
import { FIXTURE_INVALID_TOPIC } from '../../domain/generation/fixture.ts';
import { resolveModel, type GenerationSettings } from '../../domain/generation/generate.ts';
import type { PendingCorrection, RunOutcome } from '../../domain/generation/runs.ts';
import { createCorrectArticleTask, type CorrectArticleTaskDeps } from './correct-article.ts';

// A leitura e a gravação da execução são espionadas; o banco de verdade fica no contrato.
const mocks = vi.hoisted(() => ({ pendingCorrection: vi.fn(), finishRun: vi.fn() }));
vi.mock('../../domain/generation/runs.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof RunsModule>()),
  pendingCorrection: mocks.pendingCorrection,
  finishRun: mocks.finishRun,
}));

const version = (title = 'Café coado'): ContentData => ({
  kind: 'article',
  slug: 'cafe-coado',
  title,
  description: 'Como coar café.',
  authorIds: [7],
  taxonomyIds: [3],
  publishedAt: '2026-11-03T12:00:00.000Z',
  blocks: [
    {
      n: 1,
      type: 'text',
      content: [{ type: 'paragraph', children: [{ type: 'text', text: 'Use água quente.' }] }],
    },
  ],
});

const run = (title?: string): PendingCorrection => ({
  runId: 3,
  siteId: 'exemplo-a',
  contentId: 42,
  baseVersion: 2,
  input: {
    version: version(title),
    comment: 'A temperatura da água está errada: use 92 °C.',
    editorialContext: 'Tom leve.',
    resources: RESOURCES,
  },
});

const helpers = { logger: { info: vi.fn(), warn: vi.fn() } } as unknown as JobHelpers;

const generation: GenerationSettings = {
  model: resolveModel('fixture'),
  pricing: { fixture: { input: 1, output: 2 } },
};

function deps(
  fetch: typeof globalThis.fetch,
  settings: GenerationSettings = generation,
): CorrectArticleTaskDeps {
  return {
    db: {} as Db,
    generation: settings,
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
  mocks.pendingCorrection.mockReset();
  mocks.finishRun.mockReset().mockResolvedValue(true);
});

describe('correct-article', () => {
  it('grava a N+1 pela rota de versões com o token do gerador e termina a execução ok', async () => {
    mocks.pendingCorrection.mockResolvedValue(run());
    const fetch = vi.fn<typeof globalThis.fetch>(() => json(201, { id: 42, version: 3 }));

    await createCorrectArticleTask(deps(fetch))({ runId: 3 }, helpers);

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect((url as URL).href).toBe(
      'http://backoffice-web:3000/api/internal/v1/contents/42/versions',
    );
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${'g'.repeat(32)}`);
    const body = JSON.parse(init?.body as string) as {
      siteId: string;
      baseVersion: number;
      content: { slug: string; taxonomyIds: number[] };
    };
    expect(body).toMatchObject({
      siteId: 'exemplo-a',
      baseVersion: 2,
      content: { slug: 'cafe-coado', taxonomyIds: [3] },
    });
    expect(outcome()).toMatchObject({
      status: 'ok',
      contentId: 42,
      call: {
        provider: 'fixture',
        model: 'fixture',
        usage: { inputTokens: 1000, outputTokens: 500 },
      },
    });
  });

  it('saída inválida termina em falha com os dados da chamada, sem chamar a rota', async () => {
    mocks.pendingCorrection.mockResolvedValue(run(FIXTURE_INVALID_TOPIC));
    const fetch = vi.fn<typeof globalThis.fetch>();

    await createCorrectArticleTask(deps(fetch))({ runId: 3 }, helpers);

    expect(fetch).not.toHaveBeenCalled();
    const value = outcome();
    expect(value.status).toBe('falha');
    expect(value.call?.prompt.user).toContain('92 °C');
  });

  it('base desatualizada (409) termina em falha com os problemas da rota', async () => {
    mocks.pendingCorrection.mockResolvedValue(run());
    const issues = [
      { code: 'content.base_outdated', message: 'Já editado', path: ['baseVersion'] },
    ];
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      json(409, { title: 'Versão-base desatualizada', status: 409, issues }),
    );

    await createCorrectArticleTask(deps(fetch))({ runId: 3 }, helpers);

    expect(outcome()).toMatchObject({
      status: 'falha',
      issues: [
        { code: 'correction.api_refused', message: expect.stringContaining('409') as string },
        ...issues,
      ],
    });
  });

  it('conteúdo recusado (422) termina em falha com os problemas da rota', async () => {
    mocks.pendingCorrection.mockResolvedValue(run());
    const issues = [{ code: 'content.unchanged', message: 'Igual à base', path: [] }];
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      json(422, { title: 'Conteúdo inválido', status: 422, issues }),
    );

    await createCorrectArticleTask(deps(fetch))({ runId: 3 }, helpers);

    expect(outcome()).toMatchObject({
      status: 'falha',
      issues: [{ code: 'correction.api_refused' }, ...issues],
    });
  });

  it.each([
    ['sem o id', { version: 3 }],
    ['com outra versão', { id: 42, version: 4 }],
    ['de outro conteúdo', { id: 41, version: 3 }],
  ])('201 %s termina em falha com resposta inválida', async (_, created) => {
    mocks.pendingCorrection.mockResolvedValue(run());
    const fetch = vi.fn<typeof globalThis.fetch>(() => json(201, created));

    await createCorrectArticleTask(deps(fetch))({ runId: 3 }, helpers);

    expect(outcome()).toMatchObject({
      status: 'falha',
      issues: [{ code: 'correction.api_invalid_response' }],
    });
  });

  it('rota inacessível termina em falha, sem lançar', async () => {
    mocks.pendingCorrection.mockResolvedValue(run());
    const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.reject(new Error('ECONNREFUSED')));

    await createCorrectArticleTask(deps(fetch))({ runId: 3 }, helpers);

    expect(outcome()).toMatchObject({
      status: 'falha',
      issues: [{ code: 'correction.api_unreachable' }],
    });
  });

  it('exceção do núcleo termina em falha sem dados da chamada, sem lançar', async () => {
    mocks.pendingCorrection.mockResolvedValue(run());
    const fetch = vi.fn<typeof globalThis.fetch>();
    const broken = {
      get model(): never {
        throw new Error('modelo indisponível');
      },
      pricing: {},
    } as GenerationSettings;

    await createCorrectArticleTask(deps(fetch, broken))({ runId: 3 }, helpers);

    expect(fetch).not.toHaveBeenCalled();
    expect(outcome()).toMatchObject({
      call: null,
      status: 'falha',
      issues: [{ code: 'correction.unexpected' }],
    });
  });

  it('execução que já terminou é ignorada, sem chamar o modelo nem a rota', async () => {
    mocks.pendingCorrection.mockResolvedValue(undefined);
    const fetch = vi.fn<typeof globalThis.fetch>();

    await createCorrectArticleTask(deps(fetch))({ runId: 3 }, helpers);

    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.finishRun).not.toHaveBeenCalled();
  });

  it('payload sem runId lança', async () => {
    await expect(createCorrectArticleTask(deps(vi.fn()))({ runId: 'x' }, helpers)).rejects.toThrow(
      /Payload da correção inválido/,
    );
  });
});
