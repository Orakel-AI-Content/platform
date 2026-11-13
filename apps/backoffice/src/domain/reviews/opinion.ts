import type { Issue } from '@orakel/content-model';
import type { Block, Inline } from '@orakel/content-model/v1';
import { APICallError, NoObjectGeneratedError, generateObject, type LanguageModel } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import * as z from 'zod';

import type { ContentData } from '../../db/schema/index.ts';
import { FIXTURE_USAGE } from '../generation/fixture.ts';
import { outputIssues, tokens, type GenerationSettings } from '../generation/generate.ts';
import { costUsd, type TokenUsage } from '../generation/pricing.ts';

// Núcleo do parecer automático da revisão (workspace#94): uma chamada ao LLM, com saída
// estruturada, sobre os pontos subjetivos da revisão. Espelha `generation/generate.ts`: não
// acessa o banco nem o ambiente, e o resultado traz os mesmos dados de execução que
// `generation_runs` registra. O parecer só informa: nunca aprova, devolve nem barra (RN-GEN-02).

/** Pontos subjetivos que o parecer avalia, com o que o modelo deve julgar em cada um. */
export const OPINION_POINTS = [
  {
    key: 'valor_original',
    label: 'Valor original: informação, análise ou experiência que não é só paráfrase das fontes',
  },
  {
    key: 'politicas_anuncios_afiliados',
    label: 'Conforme as políticas de conteúdo dos programas de anúncios e afiliados',
  },
  {
    key: 'linha_editorial',
    label: 'Aderente à linha editorial do site, descrita no contexto editorial',
  },
] as const;

export type OpinionPointKey = (typeof OPINION_POINTS)[number]['key'];

/** Vereditos que o modelo pode dar. */
export const MODEL_VERDICTS = ['atende', 'nao_atende', 'inconclusivo'] as const;

/** Todos os vereditos: `nao_avaliado` só o código atribui (linha editorial sem contexto). */
export const OPINION_VERDICTS = [...MODEL_VERDICTS, 'nao_avaliado'] as const;

export type OpinionVerdict = (typeof OPINION_VERDICTS)[number];

export const JUSTIFICATION_MAX = 300;

const PointSchema = z.object({
  verdict: z.enum(MODEL_VERDICTS),
  justification: z.string().min(1).max(JUSTIFICATION_MAX),
  excerpts: z.array(z.string().min(1)).min(1),
});

const BASE_POINTS = {
  valor_original: PointSchema,
  politicas_anuncios_afiliados: PointSchema,
};

/** Schema enviado ao modelo: sem contexto editorial, a linha editorial nem é pedida. */
export function opinionSchema(withEditorialLine: boolean) {
  return withEditorialLine
    ? z.object({ ...BASE_POINTS, linha_editorial: PointSchema })
    : z.object(BASE_POINTS);
}

export type EvaluatedPoint = z.infer<typeof PointSchema>;
export type OpinionPoint = EvaluatedPoint | { verdict: 'nao_avaliado' };
export type Opinion = Record<OpinionPointKey, OpinionPoint>;

export type OpinionInput = {
  /** Dados da versão em revisão. */
  data: ContentData;
  /** Texto do contexto editorial vigente do site; `null` (ou vazio) quando o site não tem. */
  editorialContext: string | null;
};

/** O que cada execução registra, como `GenerationResult`, com o parecer ou os problemas. */
export type OpinionResult = {
  prompt: { system: string; user: string };
  provider: string;
  model: string;
  usage: TokenUsage;
  costUsd: number | null;
  durationMs: number;
} & ({ ok: true; opinion: Opinion } | { ok: false; issues: Issue[] });

const MAX_OUTPUT_TOKENS = 4_000;

const inlineText = (inline: Inline): string =>
  inline.type === 'text' ? inline.text : inline.children.map((child) => child.text).join('');

const inlinesText = (inlines: readonly Inline[]) => inlines.map(inlineText).join('');

/** Linhas de texto do bloco: texto, citação e FAQ; os outros tipos não têm texto próprio. */
function blockLines(block: Block): string[] {
  switch (block.type) {
    case 'text':
      return block.content.flatMap((node) =>
        node.type === 'list' ? node.items.map(inlinesText) : [inlinesText(node.children)],
      );
    case 'quote':
      return [inlinesText(block.content)];
    case 'faq':
      return block.items.flatMap((item) => [item.question, inlinesText(item.answer)]);
    default:
      return [];
  }
}

/** Texto do artigo que o modelo avalia: título, descrição e o texto dos blocos, uma linha cada. */
export function articleText(data: ContentData): string {
  return articleLines(data).join('\n');
}

function articleLines(data: ContentData): string[] {
  return [data.title, data.description ?? '', ...data.blocks.flatMap(blockLines)].filter(
    (line) => line !== '',
  );
}

function hasContext(context: string | null): context is string {
  return context !== null && context.trim() !== '';
}

export function buildOpinionPrompt(input: OpinionInput): { system: string; user: string } {
  const withEditorialLine = hasContext(input.editorialContext);
  const points = OPINION_POINTS.filter(
    (point) => withEditorialLine || point.key !== 'linha_editorial',
  );
  const system = [
    'Você dá um parecer sobre um artigo em português do Brasil, para apoiar o revisor humano.',
    'Avalie cada ponto abaixo e responda só com o objeto do schema:',
    ...points.map((point) => `- ${point.key}: ${point.label}`),
    `Veredito de cada ponto: ${MODEL_VERDICTS.join(', ')}.`,
    `Justificativa curta, com até ${JUSTIFICATION_MAX} caracteres.`,
    'Trechos: ao menos um por ponto, copiados literalmente do artigo, sem alterar nada.',
  ].join('\n');
  const user = [
    ...(withEditorialLine ? ['Contexto editorial do site:', input.editorialContext, ''] : []),
    'Artigo:',
    articleText(input.data),
  ].join('\n');
  return { system, user };
}

/** Primeira frase de uma linha, ou a linha inteira quando não há pontuação final. */
function firstSentence(line: string): string {
  return /^.*?[.!?](?=\s|$)/.exec(line)?.[0] ?? line;
}

/**
 * Modo `fixture` do parecer: o mock do AI SDK, sem rede e determinístico. Todos os pontos
 * pedidos saem como `atende`, com a primeira frase do corpo do artigo como trecho.
 */
function opinionFixtureModel(data: ContentData, withEditorialLine: boolean): LanguageModel {
  const lines = articleLines(data);
  const excerpt = firstSentence(lines.find((line) => line !== data.title) ?? data.title);
  const points = OPINION_POINTS.filter(
    (point) => withEditorialLine || point.key !== 'linha_editorial',
  );
  const object = Object.fromEntries(
    points.map((point) => [
      point.key,
      {
        verdict: 'atende',
        justification: `Parecer de teste do modo fixture sobre ${point.key}.`,
        excerpts: [excerpt],
      },
    ]),
  );
  return new MockLanguageModelV4({
    provider: 'fixture',
    modelId: 'fixture',
    doGenerate: {
      content: [{ type: 'text', text: JSON.stringify(object) }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: {
          total: FIXTURE_USAGE.inputTokens,
          noCache: FIXTURE_USAGE.inputTokens,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: {
          total: FIXTURE_USAGE.outputTokens,
          text: FIXTURE_USAGE.outputTokens,
          reasoning: undefined,
        },
      },
      warnings: [],
    },
  });
}

/** Troca o código genérico da geração pelo do parecer; os `schema.*` do Zod ficam. */
const asOpinionIssue = (issue: Issue): Issue =>
  issue.code === 'generation.invalid_output' ? { ...issue, code: 'opinion.invalid_output' } : issue;

/**
 * Dá o parecer com uma única chamada ao modelo (sem retentativa, nem as internas do SDK).
 * Saída fora do schema e erro do provedor voltam como falha, com os mesmos dados de execução
 * de um sucesso. Sem contexto editorial, `linha_editorial` sai `nao_avaliado`.
 */
export async function opine(
  input: OpinionInput,
  settings: GenerationSettings,
): Promise<OpinionResult> {
  const { model, pricing } = settings;
  const withEditorialLine = hasContext(input.editorialContext);
  const prompt = buildOpinionPrompt(input);
  const call = { prompt, provider: model.provider, model: model.model };
  const started = performance.now();
  const finish = (usage: TokenUsage) => ({
    ...call,
    usage,
    costUsd: costUsd(pricing, model.id, usage),
    durationMs: Math.round(performance.now() - started),
  });

  const languageModel =
    model.provider === 'fixture'
      ? opinionFixtureModel(input.data, withEditorialLine)
      : model.languageModel;

  let generated;
  try {
    generated = await generateObject({
      model: languageModel,
      schema: opinionSchema(withEditorialLine),
      schemaName: 'parecer',
      system: prompt.system,
      prompt: prompt.user,
      maxRetries: 0,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    });
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      return {
        ...finish(tokens(error.usage)),
        ok: false,
        issues: outputIssues(error).map(asOpinionIssue),
      };
    }
    if (APICallError.isInstance(error)) {
      const message = `O provedor recusou a chamada (${error.statusCode ?? 'sem status'}): ${error.message}`;
      return {
        ...finish(tokens(undefined)),
        ok: false,
        issues: [{ code: 'opinion.provider_error', message, path: [] }],
      };
    }
    throw error;
  }

  const object: Partial<Record<OpinionPointKey, EvaluatedPoint>> = generated.object;
  const opinion: Opinion = {
    valor_original: generated.object.valor_original,
    politicas_anuncios_afiliados: generated.object.politicas_anuncios_afiliados,
    linha_editorial: object.linha_editorial ?? { verdict: 'nao_avaliado' },
  };
  return { ...finish(tokens(generated.usage)), ok: true, opinion };
}
