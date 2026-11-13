import type { JobHelpers } from 'graphile-worker';
import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as OpinionsModule from '../../domain/reviews/opinions.ts';

import type { Db } from '../../db/client.ts';
import type { ContentData } from '../../db/schema/index.ts';
import { FIXTURE_USAGE } from '../../domain/generation/fixture.ts';
import { resolveModel, type ResolvedModel } from '../../domain/generation/generate.ts';
import type { PricingTable } from '../../domain/generation/pricing.ts';
import { createReviewOpinionTask } from './review-opinion.ts';

// A leitura e a gravação são espionadas; o banco de verdade fica no contrato
// (opinions.contract.test.ts). O modelo é o `fixture` ou um mock: nenhum teste usa rede.
const mocks = vi.hoisted(() => ({ opinionInputFor: vi.fn(), recordOpinion: vi.fn() }));
vi.mock('../../domain/reviews/opinions.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof OpinionsModule>()),
  ...mocks,
}));

const db = {} as Db;
const NOW = new Date('2026-11-13T12:00:00Z');
const TARGET = { siteId: 'exemplo-a', contentId: 7, version: 2 };
const pricing: PricingTable = { fixture: { input: 0.1, output: 0.5 } };

const data: ContentData = {
  kind: 'article',
  title: 'Café coado em casa',
  slug: 'cafe-coado-em-casa',
  description: 'Um guia para o primeiro café coado.',
  authorIds: [7],
  taxonomyIds: [],
  publishedAt: '2026-11-03T12:00:00.000Z',
  blocks: [
    {
      n: 1,
      type: 'text',
      content: [{ type: 'paragraph', children: [{ type: 'text', text: 'Use moagem média.' }] }],
    },
  ],
};

function run(model: ResolvedModel, payload: unknown = TARGET) {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const done = createReviewOpinionTask({
    db,
    generation: { model, pricing },
    now: () => NOW,
  })(payload, { logger } as unknown as JobHelpers);
  return { done, logger };
}

/** O desfecho gravado (`recordOpinion`) na única chamada. */
function recorded() {
  expect(mocks.recordOpinion).toHaveBeenCalledTimes(1);
  const [, target, outcome, finishedAt] = mocks.recordOpinion.mock.calls[0] as [
    unknown,
    unknown,
    OpinionsModule.OpinionOutcome,
    Date,
  ];
  expect(target).toEqual(TARGET);
  expect(finishedAt).toEqual(NOW);
  return outcome;
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.opinionInputFor.mockResolvedValue({
    data,
    editorialContext: { version: 3, body: 'Tom leve, público iniciante.' },
  });
  mocks.recordOpinion.mockResolvedValue(true);
  vi.stubGlobal('fetch', () => Promise.reject(new Error('rede bloqueada no teste')));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('review-opinion', () => {
  it('com o fixture, grava o parecer ok com os pontos, tokens, custo, duração e o contexto usado', async () => {
    const { done } = run(resolveModel('fixture'));
    await expect(done).resolves.toBeUndefined();

    const { result, editorialContextVersion } = recorded();
    expect(editorialContextVersion).toBe(3);
    expect(result).toMatchObject({ ok: true, provider: 'fixture', usage: FIXTURE_USAGE });
    if (!result.ok) return;
    expect(Object.keys(result.opinion).sort()).toEqual([
      'linha_editorial',
      'politicas_anuncios_afiliados',
      'valor_original',
    ]);
    expect(result.costUsd).toBeTypeOf('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('sem contexto editorial, grava a versão do contexto nula', async () => {
    mocks.opinionInputFor.mockResolvedValue({ data, editorialContext: null });
    await run(resolveModel('fixture')).done;

    const { result, editorialContextVersion } = recorded();
    expect(editorialContextVersion).toBeNull();
    expect(result).toMatchObject({
      ok: true,
      opinion: { linha_editorial: { verdict: 'nao_avaliado' } },
    });
  });

  it('saída inválida grava falha com os problemas e os dados de execução, sem lançar', async () => {
    const mock = new MockLanguageModelV4({
      doGenerate: {
        content: [{ type: 'text', text: 'não é JSON' }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 20, text: 20, reasoning: undefined },
        },
        warnings: [],
      },
    });
    const { done, logger } = run({
      id: 'fixture',
      provider: 'anthropic',
      model: 'teste',
      languageModel: mock,
    });
    await expect(done).resolves.toBeUndefined();

    const { result } = recorded();
    expect(mock.doGenerateCalls).toHaveLength(1);
    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: 'opinion.invalid_output' }],
      provider: 'anthropic',
      model: 'teste',
      usage: { inputTokens: 10, outputTokens: 20 },
    });
    expect(result.prompt.user).not.toBe('');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('falha'));
  });

  it('versão inexistente não chama o modelo nem grava, e não lança', async () => {
    mocks.opinionInputFor.mockResolvedValue(undefined);
    const { done, logger } = run(resolveModel('fixture'));
    await expect(done).resolves.toBeUndefined();

    expect(mocks.recordOpinion).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('não existe'));
  });

  it('parecer que já terminou ou sumiu não é sobrescrito: só avisa', async () => {
    mocks.recordOpinion.mockResolvedValue(false);
    const { done, logger } = run(resolveModel('fixture'));
    await expect(done).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('já terminou'));
  });

  it('payload inválido lança antes de ler o banco', async () => {
    await expect(run(resolveModel('fixture'), { siteId: '', contentId: 7 }).done).rejects.toThrow(
      /Payload do parecer inválido/,
    );
    expect(mocks.opinionInputFor).not.toHaveBeenCalled();
  });
});
