import { RESOURCES, type Resources } from '@orakel/content-model/v1';
import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SEO_DESCRIPTION_MAX, SEO_TITLE_MAX } from '../reviews/checks.ts';
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
  categories: [],
  resources: RESOURCES,
  publishedAt: new Date('2026-11-03T12:00:00Z'),
};

const categories = [
  { id: 3, slug: 'metodos', name: 'Métodos' },
  { id: 4, slug: 'graos', name: 'Grãos' },
];

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

type JsonSchema = {
  properties: Record<string, { items?: { enum?: unknown[] } } | undefined>;
  required?: string[];
};

/** O JSON Schema enviado ao modelo. */
function sentSchema(call: GenerateCall): JsonSchema {
  const format = call.responseFormat;
  if (format?.type !== 'json') throw new Error('Chamada sem saída estruturada');
  return format.schema as JsonSchema;
}

const article = (extra: Record<string, unknown>) => {
  const base = JSON.parse(valid) as Record<string, unknown>;
  return JSON.stringify({ ...base, ...extra });
};

const valid = JSON.stringify({
  title: 'Café coado',
  slug: 'cafe-coado',
  description: 'Como coar café.',
  seo: { title: 'Café coado em casa', description: 'O passo a passo do café coado.' },
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
        seo: { title: 'Café coado em casa', description: 'O passo a passo do café coado.' },
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
    expect(result.prompt.system).toContain(`no máximo ${SEO_TITLE_MAX} caracteres`);
    expect(result.prompt.system).toContain(`no máximo ${SEO_DESCRIPTION_MAX}`);
  });

  it('as categorias do site vão como enum fechado e os slugs escolhidos viram taxonomyIds', async () => {
    const { resolved, mock } = mockModel(article({ categories: ['graos'] }));
    const result = await generate({ ...input, categories }, { model: resolved, pricing });

    const schema = sentSchema(mock.doGenerateCalls[0]!);
    expect(schema.properties.categories?.items?.enum).toEqual(['metodos', 'graos']);
    expect(schema.required).toContain('categories');
    expect(result).toMatchObject({ ok: true, content: { taxonomyIds: [4] } });
    expect(result.prompt.user).toContain('- metodos: Métodos');
    expect(result.prompt.system).toContain('categorias da lista do site');
  });

  it('categoria fora da lista do site é falha da saída, sem nova chamada', async () => {
    const { resolved, mock } = mockModel(article({ categories: ['inventada'] }));
    const result = await generate({ ...input, categories }, { model: resolved, pricing });
    expect(mock.doGenerateCalls).toHaveLength(1);
    expect(result.ok).toBe(false);
  });

  it('sem categorias no site, o campo some do schema e o artigo sai sem taxonomia', async () => {
    const { resolved, mock } = mockModel(valid);
    const result = await generate(input, { model: resolved, pricing });

    const schema = sentSchema(mock.doGenerateCalls[0]!);
    expect(schema.properties.categories).toBeUndefined();
    expect(schema.required).not.toContain('categories');
    expect(schema.required).toContain('seo');
    expect(result).toMatchObject({ ok: true, content: { taxonomyIds: [] } });
    expect(result.prompt.user).not.toContain('Categorias do site');
  });

  it('SEO acima dos limites não faz a geração falhar (vira aviso na revisão)', async () => {
    const seo = {
      title: 't'.repeat(SEO_TITLE_MAX + 1),
      description: 'd'.repeat(SEO_DESCRIPTION_MAX + 1),
    };
    const { resolved } = mockModel(article({ seo }));
    const result = await generate(input, { model: resolved, pricing });
    expect(result).toMatchObject({ ok: true, content: { seo } });
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

  it('escolhe a primeira categoria do site e devolve SEO dentro dos limites', async () => {
    const result = await generate({ ...input, categories }, { model: fixture(), pricing });
    expect(result).toMatchObject({ ok: true, content: { taxonomyIds: [3] } });
    if (!result.ok) return;
    expect(result.content.seo?.title?.length).toBeLessThanOrEqual(SEO_TITLE_MAX);
    expect(result.content.seo?.description?.length).toBeLessThanOrEqual(SEO_DESCRIPTION_MAX);
  });

  it('sem categorias no site, conclui sem taxonomia', async () => {
    const result = await generate(input, { model: fixture(), pricing });
    expect(result).toMatchObject({ ok: true, content: { taxonomyIds: [] } });
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
