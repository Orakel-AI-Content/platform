import { ContentSchema, RESOURCES, validateContent, type Block } from '@orakel/content-model/v1';
import { APICallError } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContentData } from '../../db/schema/index.ts';
import type { EditBlock } from '../content/contents.ts';
import { correct, type CorrectionInput, type CorrectionResult } from './correct.ts';
import { FIXTURE_INVALID_TOPIC, FIXTURE_USAGE } from './fixture.ts';
import { resolveModel, type ResolvedModel } from './generate.ts';
import type { PricingTable } from './pricing.ts';

const paragraph = (text: string) => [
  { type: 'paragraph' as const, children: [{ type: 'text' as const, text }] },
];

/** Versão devolvida: texto, imagem, FAQ e imagem, com capa, taxonomia e SEO. */
const version: ContentData = {
  kind: 'article',
  slug: 'cafe-coado',
  title: 'Café coado',
  description: 'Como coar café.',
  authorIds: [7],
  taxonomyIds: [3],
  coverMediaId: 9,
  publishedAt: '2026-11-03T12:00:00.000Z',
  seo: { title: 'Café coado em casa', canonical: 'https://exemplo.com/cafe-coado/' },
  blocks: [
    { n: 1, type: 'text', content: paragraph('Use água quente.') },
    { n: 2, type: 'image', mediaId: 5, alt: 'Coador' },
    {
      n: 3,
      type: 'faq',
      items: [{ question: 'Qual pó?', answer: [{ type: 'text', text: 'Médio' }] }],
    },
    { n: 4, type: 'image', mediaId: 6, alt: 'Xícara' },
  ],
};

const input: CorrectionInput = {
  version,
  comment: 'A temperatura da água está errada: use 92 °C.',
  editorialContext: 'Tom leve, frases curtas.',
  resources: RESOURCES,
};

const pricing: PricingTable = { fixture: { input: 0.1, output: 0.5 } };

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 20, text: 20, reasoning: undefined },
};

function mockModel(text: string): { resolved: ResolvedModel; mock: MockLanguageModelV4 } {
  const mock = new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: 'text', text }],
      finishReason: { unified: 'stop', raw: undefined },
      usage,
      warnings: [],
    },
  });
  return {
    mock,
    resolved: { id: 'anthropic:teste', provider: 'anthropic', model: 'teste', languageModel: mock },
  };
}

const isNew = (block: EditBlock) => 'new' in block && block.new === true;

/** Valida o resultado como na spec: `n` provisórios nos novos e as referências da versão. */
function validate(result: CorrectionResult) {
  if (!result.ok) throw new Error('correção falhou');
  let n = 100;
  const blocks = result.content.blocks.map((block) => {
    if (!isNew(block)) return block;
    const fields: Record<string, unknown> = { ...block, n: n++ };
    delete fields.new;
    return fields as Block;
  });
  const parsed = ContentSchema.parse({ ...result.content, id: 1, blocks });
  return validateContent(
    parsed,
    { authorIds: new Set([7]), taxonomyIds: new Set([3]), mediaIds: new Set([5, 6, 9]) },
    RESOURCES,
  );
}

/** Tipo e `n` (ou `new`) de cada bloco, para comparar a ordem. */
const shape = (result: CorrectionResult) =>
  result.ok
    ? result.content.blocks.map((block) =>
        isNew(block) ? `${block.type}:new` : `${block.type}:${String(block.n)}`,
      )
    : [];

describe('correct', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('rede bloqueada no teste')));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mantém o n dos blocos devolvidos e reinsere as imagens depois do bloco que as precedia', async () => {
    const { resolved, mock } = mockModel(
      JSON.stringify({
        title: 'Café coado a 92 °C',
        description: 'Como coar café na temperatura certa.',
        blocks: [
          {
            n: 3,
            type: 'faq',
            items: [{ question: 'Qual pó?', answer: [{ type: 'text', text: 'Médio' }] }],
          },
          { type: 'text', content: paragraph('A água vai a 92 °C.') },
          { n: 1, type: 'text', content: paragraph('Use água a 92 °C.') },
        ],
      }),
    );
    const result = await correct(input, { model: resolved, pricing });
    expect(mock.doGenerateCalls).toHaveLength(1);
    expect(shape(result)).toEqual(['faq:3', 'image:4', 'text:new', 'text:1', 'image:2']);
    if (!result.ok) return;
    expect(result.content.blocks[4]).toEqual(version.blocks[1]);
    expect(result.content.blocks[1]).toEqual(version.blocks[3]);
    expect(result.content.blocks[3]).toMatchObject({ content: paragraph('Use água a 92 °C.') });
    expect(validate(result).ok).toBe(true);
  });

  it('imagem cujo bloco anterior foi removido sobe para o anterior que sobreviveu ou o início', async () => {
    const { resolved } = mockModel(
      JSON.stringify({
        title: 'Café coado',
        description: 'Como coar café.',
        blocks: [
          {
            n: 3,
            type: 'faq',
            items: [{ question: 'Qual pó?', answer: [{ type: 'text', text: 'Fino' }] }],
          },
        ],
      }),
    );
    const result = await correct(input, { model: resolved, pricing });
    expect(shape(result)).toEqual(['image:2', 'faq:3', 'image:4']);
  });

  it('slug, autores, taxonomias, capa e data vêm da versão; o SEO reescrito mantém o canonical', async () => {
    const { resolved } = mockModel(
      JSON.stringify({
        title: 'Novo título',
        description: 'Nova descrição.',
        seo: { title: 'Novo título SEO', description: 'Nova descrição SEO.' },
        slug: 'slug-que-o-modelo-inventou',
        blocks: [{ n: 1, type: 'text', content: paragraph('Oi') }],
      }),
    );
    const result = await correct(input, { model: resolved, pricing });
    expect(result).toMatchObject({
      ok: true,
      content: {
        kind: 'article',
        slug: 'cafe-coado',
        title: 'Novo título',
        description: 'Nova descrição.',
        authorIds: [7],
        taxonomyIds: [3],
        coverMediaId: 9,
        publishedAt: '2026-11-03T12:00:00.000Z',
        seo: {
          title: 'Novo título SEO',
          description: 'Nova descrição SEO.',
          canonical: 'https://exemplo.com/cafe-coado/',
        },
      },
    });
    expect(result.ok && 'id' in result.content).toBe(false);
  });

  it('n que não é de bloco de texto da versão volta como correction.block_unknown', async () => {
    const { resolved, mock } = mockModel(
      JSON.stringify({
        title: 'Café coado',
        description: 'Como coar café.',
        blocks: [
          { n: 2, type: 'text', content: paragraph('Era a imagem') },
          { n: 99, type: 'text', content: paragraph('Não existe') },
        ],
      }),
    );
    const result = await correct(input, { model: resolved, pricing });
    expect(mock.doGenerateCalls).toHaveLength(1);
    expect(result).toMatchObject({
      ok: false,
      issues: [
        { code: 'correction.block_unknown', path: ['blocks', 0, 'n'] },
        { code: 'correction.block_unknown', path: ['blocks', 1, 'n'] },
      ],
      usage: { inputTokens: 10, outputTokens: 20 },
    });
  });

  it('saída fora do schema volta como falha com os dados da execução, sem nova chamada', async () => {
    const { resolved, mock } = mockModel(JSON.stringify({ title: 'X', blocks: [] }));
    const result = await correct(input, { model: resolved, pricing });
    expect(mock.doGenerateCalls).toHaveLength(1);
    expect(result).toMatchObject({
      ok: false,
      provider: 'anthropic',
      model: 'teste',
      usage: { inputTokens: 10, outputTokens: 20 },
      costUsd: null,
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.prompt.user).toContain(input.comment);
    if (result.ok) return;
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('resposta que não é JSON também é falha, sem nova chamada', async () => {
    const { resolved, mock } = mockModel('não é JSON');
    const result = await correct(input, { model: resolved, pricing });
    expect(mock.doGenerateCalls).toHaveLength(1);
    expect(result).toMatchObject({ ok: false });
  });

  it('erro do provedor volta como generation.provider_error, sem lançar e sem nova chamada', async () => {
    const mock = new MockLanguageModelV4({
      doGenerate: () =>
        Promise.reject(
          new APICallError({
            message: 'sobrecarregado',
            url: 'https://api.exemplo.com',
            requestBodyValues: {},
            statusCode: 529,
            isRetryable: true,
          }),
        ),
    });
    const resolved: ResolvedModel = {
      id: 'anthropic:teste',
      provider: 'anthropic',
      model: 'teste',
      languageModel: mock,
    };
    const result = await correct(input, { model: resolved, pricing });
    expect(mock.doGenerateCalls).toHaveLength(1);
    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: 'generation.provider_error' }],
      usage: { inputTokens: 0, outputTokens: 0 },
      provider: 'anthropic',
    });
  });

  it('o comentário entra no prompt, com o artigo e só os blocos que a geração produz', async () => {
    const { resolved } = mockModel('{}');
    const { prompt } = await correct(input, { model: resolved, pricing });
    expect(prompt.user).toContain('Tema: Café coado');
    expect(prompt.user).toContain('A temperatura da água está errada: use 92 °C.');
    expect(prompt.user).toContain('Tom leve, frases curtas.');
    expect(prompt.user).toContain('"n":1');
    expect(prompt.user).toContain('"n":3');
    expect(prompt.user).not.toContain('"mediaId"');
  });
});

describe('correct no modo fixture', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('rede bloqueada no teste')));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const fixture = () => resolveModel('fixture');

  it('corrige sem rede e de forma determinística, e o resultado passa no content-model', async () => {
    const first = await correct(input, { model: fixture(), pricing });
    const second = await correct(input, { model: fixture(), pricing });
    expect(first.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.content).toEqual(first.content);
    expect(first).toMatchObject({ provider: 'fixture', model: 'fixture', usage: FIXTURE_USAGE });
    expect(first.costUsd).toBeCloseTo(0.00035, 10);
    expect(first.content.slug).toBe('cafe-coado');
    // O fixture devolve só um texto novo: as imagens da versão voltam intactas, no início.
    expect(shape(first)).toEqual(['image:2', 'image:4', 'text:new']);
    expect(validate(first).ok).toBe(true);
  });

  it('sem contexto editorial, a correção roda normalmente', async () => {
    const result = await correct(
      { ...input, editorialContext: undefined },
      { model: fixture(), pricing },
    );
    expect(result.ok).toBe(true);
    expect(result.prompt.user).not.toContain('Contexto editorial');
    expect(validate(result).ok).toBe(true);
  });

  it('o tema de saída inválida aciona o caminho de falha', async () => {
    const result = await correct(
      { ...input, version: { ...version, title: FIXTURE_INVALID_TOPIC } },
      { model: fixture(), pricing },
    );
    expect(result.ok).toBe(false);
  });
});
