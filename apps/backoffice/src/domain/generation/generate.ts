import { createAnthropic } from '@ai-sdk/anthropic';
import type { Issue } from '@orakel/content-model';
import {
  ContentSchema,
  FaqBlockSchema,
  QuoteBlockSchema,
  SlugSchema,
  TextBlockSchema,
  TocBlockSchema,
  validateContent,
  type Content,
  type Resources,
} from '@orakel/content-model/v1';
import { APICallError, NoObjectGeneratedError, generateObject, type LanguageModel } from 'ai';
import * as z from 'zod';

import { SEO_DESCRIPTION_MAX, SEO_TITLE_MAX } from '../reviews/checks.ts';
import { fixtureModel } from './fixture.ts';
import { costUsd, type PricingTable, type TokenUsage } from './pricing.ts';

// Núcleo da geração básica (workspace#23, ADR 0018): uma chamada ao LLM com saída
// estruturada derivada do Zod dos blocos, limitada aos tipos que a release do site suporta.
// Não acessa o banco nem o ambiente: quem chama resolve recursos, autor e configuração.

/** Modelo resolvido de `LLM_MODEL`: `fixture` ou `anthropic:<modelo>`. */
export type ResolvedModel = {
  /** Como em `LLM_MODEL`; é a chave da tabela de preços. */
  id: string;
  provider: string;
  model: string;
  languageModel: LanguageModel;
};

export function resolveModel(id: string, apiKey?: string): ResolvedModel {
  if (id === 'fixture') {
    return { id, provider: 'fixture', model: 'fixture', languageModel: fixtureModel() };
  }
  const [provider, model] = id.split(':', 2);
  if (provider !== 'anthropic' || model === undefined || model === '') {
    throw new Error(`Modelo de geração não suportado: ${id}`);
  }
  // A chave vem só de quem chama (src/env.ts); sem ela o provedor leria ANTHROPIC_API_KEY.
  if (apiKey === undefined || apiKey === '') {
    throw new Error(`Defina LLM_API_KEY para gerar com ${id}`);
  }
  return { id, provider, model, languageModel: createAnthropic({ apiKey })(model) };
}

/** Tipos de bloco que o gerador produz; `image` fica fora (exige mídia já cadastrada). */
export const GENERATED_BLOCKS = {
  text: TextBlockSchema.omit({ n: true }),
  toc: TocBlockSchema.omit({ n: true }),
  quote: QuoteBlockSchema.omit({ n: true }),
  faq: FaqBlockSchema.omit({ n: true }),
} as const;

export type GeneratedBlockType = keyof typeof GENERATED_BLOCKS;

/** Os tipos de `resources.blockTypes` que o gerador sabe produzir, na ordem dos recursos. */
export function generatedBlockTypes(resources: Resources): GeneratedBlockType[] {
  return resources.blockTypes.filter((type): type is GeneratedBlockType =>
    Object.hasOwn(GENERATED_BLOCKS, type),
  );
}

/**
 * Schema enviado ao modelo: o artigo sem ID, autor nem datas, só com os blocos permitidos, o
 * SEO e as categorias como enum fechado dos slugs do site (o campo some sem categorias). Os
 * limites do SEO ficam só no prompt: um estouro vira aviso na revisão, não falha da geração.
 */
export function articleSchema(
  types: readonly [GeneratedBlockType, ...GeneratedBlockType[]],
  categorySlugs: readonly string[] = [],
) {
  const [first, ...rest] = types.map((type) => GENERATED_BLOCKS[type]);
  const article = z.object({
    title: z.string().min(1),
    slug: SlugSchema,
    description: z.string().min(1),
    seo: z.object({ title: z.string().min(1), description: z.string().min(1) }),
    blocks: z.array(z.discriminatedUnion('type', [first!, ...rest])).min(1),
  });
  const [firstSlug, ...otherSlugs] = categorySlugs;
  if (firstSlug === undefined) return article;
  return article.extend({ categories: z.array(z.enum([firstSlug, ...otherSlugs])).min(1) });
}

/** Categoria do site que o modelo pode escolher (taxonomia `kind: 'category'`). */
export type GenerationCategory = { id: number; slug: string; name: string };

export type GenerationInput = {
  topic: string;
  /** Texto do contexto editorial vigente do site. */
  editorialContext: string;
  author: { id: number; name: string };
  /** Categorias do site; vazio quando o site não tem nenhuma. */
  categories: readonly GenerationCategory[];
  /** Recursos da release do site (`resourcesFor`). */
  resources: Resources;
  /** Data de publicação proposta do artigo (o fluxo de revisão a ajusta). */
  publishedAt: Date;
};

export type GenerationSettings = {
  model: ResolvedModel;
  pricing: PricingTable;
};

export type GeneratedContent = Omit<Content, 'id'>;

/** O que cada execução registra (R5), com o artigo validado ou os problemas da saída. */
export type GenerationResult = {
  prompt: { system: string; user: string };
  provider: string;
  model: string;
  usage: TokenUsage;
  costUsd: number | null;
  durationMs: number;
} & ({ ok: true; content: GeneratedContent } | { ok: false; issues: Issue[] });

export const MAX_OUTPUT_TOKENS = 16_000;

export function buildPrompt(
  input: GenerationInput,
  types: readonly GeneratedBlockType[],
): { system: string; user: string } {
  const system = [
    'Você escreve artigos em português do Brasil para um site de conteúdo.',
    'Siga o contexto editorial do site e responda só com o objeto do schema.',
    `Use apenas estes tipos de bloco no corpo: ${types.join(', ')}.`,
    'O slug é kebab-case ASCII, derivado do título.',
    `O seo.title tem no máximo ${SEO_TITLE_MAX} caracteres e o seo.description no máximo ${SEO_DESCRIPTION_MAX}.`,
    ...(input.categories.length > 0
      ? ['Escolha uma ou mais categorias da lista do site, pelo slug.']
      : []),
  ].join('\n');
  const user = [
    `Tema: ${input.topic}`,
    `Autor: ${input.author.name}`,
    ...(input.categories.length > 0
      ? [
          '',
          'Categorias do site (slug: nome):',
          ...input.categories.map((category) => `- ${category.slug}: ${category.name}`),
        ]
      : []),
    '',
    'Contexto editorial:',
    input.editorialContext,
  ].join('\n');
  return { system, user };
}

export function tokens(
  usage: { inputTokens?: number; outputTokens?: number } | undefined,
): TokenUsage {
  return { inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0 };
}

/** Issues `schema.*` do Zod na cadeia de causas do erro do SDK, ou um issue genérico. */
export function outputIssues(error: NoObjectGeneratedError): Issue[] {
  let cause: unknown = error.cause;
  for (let depth = 0; depth < 4 && cause !== undefined; depth++) {
    if (cause instanceof z.ZodError) {
      return cause.issues.map((issue) => ({
        code: `schema.${issue.code}`,
        message: issue.message,
        path: issue.path,
      }));
    }
    cause = cause instanceof Error ? cause.cause : undefined;
  }
  return [{ code: 'generation.invalid_output', message: error.message, path: [] }];
}

/**
 * Gera um artigo com uma única chamada ao modelo (sem retentativa, nem as internas do SDK:
 * R4). Saída fora do schema ou reprovada na validação do content-model volta como falha, com
 * os mesmos dados de execução de um sucesso.
 */
export async function generate(
  input: GenerationInput,
  settings: GenerationSettings,
): Promise<GenerationResult> {
  const { model, pricing } = settings;
  const types = generatedBlockTypes(input.resources);
  const prompt = buildPrompt(input, types);
  const call = { prompt, provider: model.provider, model: model.model };
  const started = performance.now();
  const finish = (usage: TokenUsage) => ({
    ...call,
    usage,
    costUsd: costUsd(pricing, model.id, usage),
    durationMs: Math.round(performance.now() - started),
  });

  const [first, ...rest] = types;
  if (first === undefined) {
    return {
      ...finish(tokens(undefined)),
      ok: false,
      issues: [
        {
          code: 'generation.no_block_types',
          message: 'A release do site não suporta nenhum tipo de bloco que o gerador produz',
          path: ['blocks'],
        },
      ],
    };
  }

  let generated;
  try {
    generated = await generateObject({
      model: model.languageModel,
      schema: articleSchema(
        [first, ...rest],
        input.categories.map((category) => category.slug),
      ),
      schemaName: 'artigo',
      system: prompt.system,
      prompt: prompt.user,
      maxRetries: 0,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    });
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      return { ...finish(tokens(error.usage)), ok: false, issues: outputIssues(error) };
    }
    if (APICallError.isInstance(error)) {
      const message = `O provedor recusou a chamada (${error.statusCode ?? 'sem status'}): ${error.message}`;
      return {
        ...finish(tokens(undefined)),
        ok: false,
        issues: [{ code: 'generation.provider_error', message, path: [] }],
      };
    }
    throw error;
  }

  const execution = finish(tokens(generated.usage));
  const { title, slug, description, seo, blocks } = generated.object;
  // `categories` só existe no schema (e na saída validada por ele) quando o site tem categorias.
  const { categories = [] } = generated.object as { categories?: readonly string[] };
  const chosen = new Set(categories);
  const taxonomyIds = input.categories
    .filter((category) => chosen.has(category.slug))
    .map((category) => category.id);
  const parsed = ContentSchema.safeParse({
    title,
    slug,
    description,
    seo,
    id: 1, // provisório, como em validateContentData: o definitivo é alocado na gravação
    kind: 'article',
    authorIds: [input.author.id],
    taxonomyIds,
    publishedAt: input.publishedAt.toISOString(),
    blocks: blocks.map((block, index) => ({ ...block, n: index + 1 })),
  });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({
      code: `schema.${issue.code}`,
      message: issue.message,
      path: issue.path,
    }));
    return { ...execution, ok: false, issues };
  }
  const context = {
    authorIds: new Set([input.author.id]),
    taxonomyIds: new Set(input.categories.map((category) => category.id)),
    mediaIds: new Set<number>(),
  };
  const semantic = validateContent(parsed.data, context, input.resources);
  if (!semantic.ok) return { ...execution, ok: false, issues: semantic.issues };
  const content: Partial<Content> = { ...semantic.value };
  delete content.id;
  return { ...execution, ok: true, content: content as GeneratedContent };
}
