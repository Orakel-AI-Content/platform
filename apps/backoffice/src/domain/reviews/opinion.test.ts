import { APICallError } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContentData } from '../../db/schema/index.ts';
import { FIXTURE_USAGE } from '../generation/fixture.ts';
import { resolveModel, type ResolvedModel } from '../generation/generate.ts';
import type { PricingTable } from '../generation/pricing.ts';
import {
  articleText,
  JUSTIFICATION_MAX,
  MODEL_VERDICTS,
  opine,
  OPINION_VERDICTS,
  type EvaluatedPoint,
  type OpinionInput,
  type OpinionResult,
} from './opinion.ts';

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
      content: [
        { type: 'heading', level: 2, children: [{ type: 'text', text: 'O pó' }] },
        {
          type: 'paragraph',
          children: [
            { type: 'text', text: 'Use moagem média. ' },
            { type: 'link', href: '/moagem/', children: [{ type: 'text', text: 'Veja a tabela' }] },
            { type: 'text', text: '.' },
          ],
        },
        { type: 'list', ordered: false, items: [[{ type: 'text', text: 'Filtro de papel' }]] },
      ],
    },
    { n: 2, type: 'quote', content: [{ type: 'text', text: 'Café bom é café fresco.' }] },
    {
      n: 3,
      type: 'faq',
      items: [{ question: 'Qual água?', answer: [{ type: 'text', text: 'Filtrada, a 92 °C.' }] }],
    },
  ],
};

const input: OpinionInput = {
  data,
  editorialContext: 'Tom leve, público iniciante, sem jargão.',
};

const pricing: PricingTable = { fixture: { input: 0.1, output: 0.5 } };

const point = (verdict: string) => ({
  verdict,
  justification: 'Traz experiência própria.',
  excerpts: ['Use moagem média.'],
});

/** Mock com resposta fixa, para contar as chamadas. */
function mockModel(text: string): { resolved: ResolvedModel; mock: MockLanguageModelV4 } {
  const mock = new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: 'text', text }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 20, text: 20, reasoning: undefined },
      },
      warnings: [],
    },
  });
  return {
    mock,
    resolved: { id: 'anthropic:teste', provider: 'anthropic', model: 'teste', languageModel: mock },
  };
}

/** Os dados de execução que `generation_runs` registra, presentes no sucesso e na falha. */
function expectExecution(result: OpinionResult) {
  expect(result.prompt.system).not.toBe('');
  expect(result.prompt.user).toContain('Artigo:');
  expect(result.provider).not.toBe('');
  expect(result.model).not.toBe('');
  expect(result.usage).toEqual({
    inputTokens: expect.any(Number) as number,
    outputTokens: expect.any(Number) as number,
  });
  expect('costUsd' in result).toBe(true);
  expect(result.durationMs).toBeGreaterThanOrEqual(0);
}

beforeEach(() => {
  // Nenhum teste do parecer sai para a rede: o fetch global falha se for chamado.
  vi.stubGlobal('fetch', () => Promise.reject(new Error('rede bloqueada no teste')));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('articleText', () => {
  it('junta título, descrição e o texto dos blocos, uma linha cada', () => {
    expect(articleText(data)).toBe(
      [
        'Café coado em casa',
        'Um guia para o primeiro café coado.',
        'O pó',
        'Use moagem média. Veja a tabela.',
        'Filtro de papel',
        'Café bom é café fresco.',
        'Qual água?',
        'Filtrada, a 92 °C.',
      ].join('\n'),
    );
  });
});

describe('modo fixture', () => {
  const fixture = () => resolveModel('fixture');

  it('dá os 3 pontos com veredito válido, justificativa curta e trecho literal do artigo', async () => {
    const result = await opine(input, { model: fixture(), pricing });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const text = articleText(data);
    const points = Object.values(result.opinion);
    expect(Object.keys(result.opinion).sort()).toEqual([
      'linha_editorial',
      'politicas_anuncios_afiliados',
      'valor_original',
    ]);
    for (const evaluated of points as EvaluatedPoint[]) {
      expect(MODEL_VERDICTS).toContain(evaluated.verdict);
      expect(evaluated.justification.length).toBeGreaterThan(0);
      expect(evaluated.justification.length).toBeLessThanOrEqual(JUSTIFICATION_MAX);
      expect(evaluated.excerpts.length).toBeGreaterThan(0);
      for (const excerpt of evaluated.excerpts) expect(text).toContain(excerpt);
    }
    expect(result).toMatchObject({ provider: 'fixture', model: 'fixture', usage: FIXTURE_USAGE });
    // 1.000 × 0,10/1M + 500 × 0,50/1M
    expect(result.costUsd).toBeCloseTo(0.00035, 10);
    expectExecution(result);
  });

  it('é determinístico', async () => {
    const first = await opine(input, { model: fixture(), pricing });
    const second = await opine(input, { model: fixture(), pricing });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.opinion).toEqual(first.opinion);
  });

  it('sem contexto editorial, a linha editorial sai não avaliada e os outros normalmente', async () => {
    for (const editorialContext of [null, '  ']) {
      const result = await opine({ data, editorialContext }, { model: fixture(), pricing });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.opinion.linha_editorial).toEqual({ verdict: 'nao_avaliado' });
      expect(result.opinion.valor_original.verdict).toBe('atende');
      expect(result.opinion.politicas_anuncios_afiliados.verdict).toBe('atende');
      expect(result.prompt.system).not.toContain('linha_editorial');
    }
  });
});

describe('opine', () => {
  it('devolve o parecer do modelo e os dados da execução, numa chamada', async () => {
    const { resolved, mock } = mockModel(
      JSON.stringify({
        valor_original: point('atende'),
        politicas_anuncios_afiliados: point('inconclusivo'),
        linha_editorial: point('nao_atende'),
      }),
    );
    const result = await opine(input, { model: resolved, pricing });
    expect(mock.doGenerateCalls).toHaveLength(1);
    expect(result).toMatchObject({
      ok: true,
      provider: 'anthropic',
      model: 'teste',
      usage: { inputTokens: 10, outputTokens: 20 },
      costUsd: null, // anthropic:teste não está na tabela
      opinion: {
        valor_original: { verdict: 'atende' },
        politicas_anuncios_afiliados: { verdict: 'inconclusivo' },
        linha_editorial: { verdict: 'nao_atende' },
      },
    });
    expect(result.prompt.user).toContain('Tom leve, público iniciante');
    expect(result.prompt.user).toContain('Use moagem média. Veja a tabela.');
    expectExecution(result);
  });

  it('sem contexto editorial, não pede a linha editorial ao modelo', async () => {
    const { resolved, mock } = mockModel(
      JSON.stringify({
        valor_original: point('atende'),
        politicas_anuncios_afiliados: point('atende'),
      }),
    );
    const result = await opine({ data, editorialContext: null }, { model: resolved, pricing });
    const format = mock.doGenerateCalls[0]?.responseFormat;
    expect(format?.type === 'json' && format.schema).toMatchObject({
      required: ['valor_original', 'politicas_anuncios_afiliados'],
    });
    expect(result).toMatchObject({
      ok: true,
      opinion: { linha_editorial: { verdict: 'nao_avaliado' } },
    });
  });

  it.each([
    ['veredito fora do conjunto', { ...point('nao_avaliado') }],
    ['justificativa longa demais', { ...point('atende'), justification: 'x'.repeat(301) }],
    ['sem trechos', { ...point('atende'), excerpts: [] }],
  ])('%s volta como falha com problemas, sem nova chamada', async (_, valor) => {
    const { resolved, mock } = mockModel(
      JSON.stringify({
        valor_original: valor,
        politicas_anuncios_afiliados: point('atende'),
        linha_editorial: point('atende'),
      }),
    );
    const result = await opine(input, { model: resolved, pricing });
    expect(mock.doGenerateCalls).toHaveLength(1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.every((issue) => issue.code.startsWith('schema.'))).toBe(true);
    expect(result.issues[0]?.path[0]).toBe('valor_original');
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
    expectExecution(result);
  });

  it('resposta que não é JSON também é falha, sem nova chamada', async () => {
    const { resolved, mock } = mockModel('não é JSON');
    const result = await opine(input, { model: resolved, pricing });
    expect(mock.doGenerateCalls).toHaveLength(1);
    expect(result).toMatchObject({ ok: false, issues: [{ code: 'opinion.invalid_output' }] });
    expectExecution(result);
  });

  it('erro do provedor volta como falha, sem lançar nem tentar de novo', async () => {
    const mock = new MockLanguageModelV4({
      doGenerate: () =>
        Promise.reject(
          new APICallError({
            message: 'sobrecarregado',
            url: 'https://api.anthropic.com/v1/messages',
            requestBodyValues: {},
            statusCode: 529,
            isRetryable: true,
          }),
        ),
    });
    // id na tabela de preços: o custo de uma falha sem tokens é 0, não null.
    const resolved = {
      id: 'fixture',
      provider: 'anthropic',
      model: 'teste',
      languageModel: mock,
    } satisfies ResolvedModel;
    const result = await opine(input, { model: resolved, pricing });
    expect(mock.doGenerateCalls).toHaveLength(1);
    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: 'opinion.provider_error' }],
      usage: { inputTokens: 0, outputTokens: 0 },
      costUsd: 0,
    });
    expectExecution(result);
  });

  it('nao_avaliado é veredito do resultado, nunca do modelo', () => {
    expect(OPINION_VERDICTS).toContain('nao_avaliado');
    expect(MODEL_VERDICTS).not.toContain('nao_avaliado');
  });
});
