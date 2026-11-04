import { RESOURCES, type Resources } from '@orakel/content-model/v1';
import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FIXTURE_INVALID_TOPIC, FIXTURE_USAGE } from './fixture.ts';
import {
  generate,
  generatedBlockTypes,
  resolveModel,
  type GenerationInput,
  type ResolvedModel,
} from './generate.ts';
import type { PricingTable } from './pricing.ts';

const input: GenerationInput = {
  topic: 'Café coado em casa',
  editorialContext: 'Tom leve, frases curtas, público iniciante.',
  author: { id: 7, name: 'Ana' },
  resources: RESOURCES,
  publishedAt: new Date('2026-11-03T12:00:00Z'),
};

const pricing: PricingTable = { fixture: { input: 0.1, output: 0.5 } };

type GenerateCall = MockLanguageModelV4['doGenerateCalls'][number];

/** Mock com resposta fixa, para contar as chamadas e ler o schema enviado. */
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

/** Os `type` dos blocos que o schema enviado ao modelo aceita. */
function schemaBlockTypes(call: GenerateCall): string[] {
  const format = call.responseFormat;
  if (format?.type !== 'json') throw new Error('Chamada sem saída estruturada');
  const schema = format.schema as {
    properties: { blocks: { items: { anyOf?: unknown[]; oneOf?: unknown[] } } };
  };
  const items = schema.properties.blocks.items;
  const options = (items.oneOf ?? items.anyOf ?? []) as {
    properties: { type: { const: string } };
  }[];
  return options.map((option) => option.properties.type.const);
}

const valid = JSON.stringify({
  title: 'Café coado',
  slug: 'cafe-coado',
  description: 'Como coar café.',
  blocks: [
    { type: 'text', content: [{ type: 'paragraph', children: [{ type: 'text', text: 'Oi' }] }] },
    { type: 'faq', items: [{ question: 'Qual pó?', answer: [{ type: 'text', text: 'Médio' }] }] },
  ],
});

describe('generate', () => {
  beforeEach(() => {
    // Nenhum teste da geração sai para a rede: o fetch global falha se for chamado.
    vi.stubGlobal('fetch', () => Promise.reject(new Error('rede bloqueada no teste')));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('o schema enviado só tem os tipos de bloco da release, nunca image', async () => {
    const resources: Resources = { ...RESOURCES, blockTypes: ['text', 'faq', 'image'] };
    const { resolved, mock } = mockModel(valid);
    await generate({ ...input, resources }, { model: resolved, pricing });
    expect(mock.doGenerateCalls).toHaveLength(1);
    expect(schemaBlockTypes(mock.doGenerateCalls[0]!).sort()).toEqual(['faq', 'text']);
    expect(generatedBlockTypes(RESOURCES)).toEqual(['text', 'toc', 'quote', 'faq']);
  });

  it('devolve o artigo validado, numerado e com o autor, mais os dados da execução', async () => {
    const { resolved } = mockModel(valid);
    const result = await generate(input, { model: resolved, pricing });
    expect(result).toMatchObject({
      ok: true,
      provider: 'anthropic',
      model: 'teste',
      usage: { inputTokens: 10, outputTokens: 20 },
      costUsd: null, // anthropic:teste não está na tabela
      content: {
        kind: 'article',
        slug: 'cafe-coado',
        authorIds: [7],
        taxonomyIds: [],
        publishedAt: '2026-11-03T12:00:00.000Z',
        blocks: [
          { n: 1, type: 'text' },
          { n: 2, type: 'faq' },
        ],
      },
    });
    expect(result.ok && 'id' in result.content).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.prompt.user).toContain('Tema: Café coado em casa');
    expect(result.prompt.user).toContain('Tom leve, frases curtas');
    expect(result.prompt.system).toContain('text, toc, quote, faq');
  });

  it('saída fora do content-model volta como falha, sem nova chamada ao modelo', async () => {
    const { resolved, mock } = mockModel(
      JSON.stringify({ title: 'X', slug: 'Não Kebab', description: 'd', blocks: [] }),
    );
    const result = await generate(input, { model: resolved, pricing });
    expect(mock.doGenerateCalls).toHaveLength(1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.path[0])).toEqual(
      expect.arrayContaining(['slug', 'blocks']),
    );
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
  });

  it('resposta que não é JSON também é falha, sem nova chamada', async () => {
    const { resolved, mock } = mockModel('não é JSON');
    const result = await generate(input, { model: resolved, pricing });
    expect(mock.doGenerateCalls).toHaveLength(1);
    expect(result).toMatchObject({ ok: false });
  });

  it('release sem nenhum tipo de bloco gerável falha sem chamar o modelo', async () => {
    const { resolved, mock } = mockModel(valid);
    const resources: Resources = { ...RESOURCES, blockTypes: ['image'] };
    const result = await generate({ ...input, resources }, { model: resolved, pricing });
    expect(mock.doGenerateCalls).toHaveLength(0);
    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: 'generation.no_block_types' }],
      costUsd: null,
    });
  });
});

describe('modo fixture', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('rede bloqueada no teste')));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const fixture = () => resolveModel('fixture');

  it('gera sem rede e de forma determinística, com custo pela tabela', async () => {
    const first = await generate(input, { model: fixture(), pricing });
    const second = await generate(input, { model: fixture(), pricing });
    expect(first.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.content).toEqual(first.content);
    expect(first).toMatchObject({
      provider: 'fixture',
      model: 'fixture',
      usage: FIXTURE_USAGE,
      content: { slug: 'cafe-coado-em-casa', authorIds: [7] },
    });
    // 1.000 × 0,10/1M + 500 × 0,50/1M
    expect(first.costUsd).toBeCloseTo(0.00035, 10);
  });

  it('o tema de saída inválida aciona o caminho de falha', async () => {
    const result = await generate(
      { ...input, topic: FIXTURE_INVALID_TOPIC },
      { model: fixture(), pricing },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.path[0] === 'blocks')).toBe(true);
  });
});

describe('resolveModel', () => {
  it('anthropic:<modelo> exige a chave e separa provedor e modelo', () => {
    expect(() => resolveModel('anthropic:claude-haiku-5-5')).toThrow(/LLM_API_KEY/);
    expect(resolveModel('anthropic:claude-haiku-5-5', 'sk-ant-teste')).toMatchObject({
      id: 'anthropic:claude-haiku-5-5',
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
    });
  });

  it('recusa outros provedores', () => {
    expect(() => resolveModel('openai:gpt', 'k')).toThrow(/não suportado/);
  });
});
