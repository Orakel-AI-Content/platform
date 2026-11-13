import type { Issue } from '@orakel/content-model';
import {
  BlockNumberSchema,
  ContentSchema,
  validateContent,
  type Block,
  type Content,
  type Resources,
} from '@orakel/content-model/v1';
import { APICallError, NoObjectGeneratedError, generateObject } from 'ai';
import * as z from 'zod';

import type { ContentData } from '../../db/schema/index.ts';
import type { ContentEdit, EditBlock } from '../content/contents.ts';
import {
  GENERATED_BLOCKS,
  MAX_OUTPUT_TOKENS,
  generatedBlockTypes,
  outputIssues,
  tokens,
  type GeneratedBlockType,
  type GenerationResult,
  type GenerationSettings,
} from './generate.ts';
import { costUsd, type TokenUsage } from './pricing.ts';

// Núcleo da correção automática (workspace#95): reescreve a versão devolvida a partir do
// comentário do revisor, com uma única chamada ao modelo, no molde de `generate`. O modelo
// devolve título, descrição, SEO e os blocos dos tipos que a geração produz; o resto vem da
// versão devolvida. Não acessa o banco nem o ambiente.

export type CorrectionInput = {
  /** Dados da versão devolvida (N). */
  version: ContentData;
  /** Comentário do revisor que pediu a correção. */
  comment: string;
  /** Texto do contexto editorial vigente do site, se houver. */
  editorialContext?: string;
  /** Recursos da release do site (`resourcesFor`). */
  resources: Resources;
};

/** Os dados de execução que `generation_runs` registra, com o artigo corrigido ou os problemas. */
export type CorrectionResult = Pick<
  GenerationResult,
  'prompt' | 'provider' | 'model' | 'usage' | 'costUsd' | 'durationMs'
> &
  ({ ok: true; content: ContentEdit } | { ok: false; issues: Issue[] });

/** Schema enviado ao modelo: `n` opcional por bloco (com `n`, mantido ou alterado; sem, novo). */
export function correctionSchema(types: readonly [GeneratedBlockType, ...GeneratedBlockType[]]) {
  const [first, ...rest] = types.map((type) =>
    GENERATED_BLOCKS[type].extend({ n: BlockNumberSchema.optional() }),
  );
  return z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    seo: z
      .object({
        title: z.string().min(1).optional(),
        description: z.string().min(1).optional(),
      })
      .optional(),
    blocks: z.array(z.discriminatedUnion('type', [first!, ...rest])).min(1),
  });
}

type Corrected = z.infer<ReturnType<typeof correctionSchema>>;
type CorrectedBlock = Corrected['blocks'][number];

export function buildCorrectionPrompt(
  input: CorrectionInput,
  types: readonly GeneratedBlockType[],
): { system: string; user: string } {
  const allowed = new Set<string>(types);
  const { version } = input;
  const current = {
    title: version.title,
    description: version.description,
    seo: { title: version.seo?.title, description: version.seo?.description },
    blocks: version.blocks.filter((block) => allowed.has(block.type)),
  };
  const system = [
    'Você corrige artigos em português do Brasil a partir do comentário de um revisor.',
    'Mude só o necessário para atender ao comentário e responda só com o objeto do schema.',
    'Cada bloco do artigo atual tem um número n: para manter ou alterar um bloco, devolva-o com o mesmo n; bloco novo vai sem n; bloco que não voltar é removido.',
    `Use apenas estes tipos de bloco no corpo: ${types.join(', ')}.`,
    'Imagens e outros blocos fora da lista não aparecem aqui e são preservados.',
  ].join('\n');
  const user = [
    `Tema: ${version.title}`,
    '',
    'Comentário do revisor:',
    input.comment,
    ...(input.editorialContext === undefined || input.editorialContext === ''
      ? []
      : ['', 'Contexto editorial:', input.editorialContext]),
    '',
    'Artigo atual (JSON):',
    JSON.stringify(current),
  ].join('\n');
  return { system, user };
}

/** Referências da própria versão: a correção não troca autores, taxonomias nem mídias. */
function versionReferences(version: ContentData) {
  const mediaIds = new Set<number>();
  if (version.coverMediaId !== undefined) mediaIds.add(version.coverMediaId);
  for (const block of version.blocks) if (block.type === 'image') mediaIds.add(block.mediaId);
  return {
    authorIds: new Set(version.authorIds),
    taxonomyIds: new Set(version.taxonomyIds),
    mediaIds,
  };
}

/** Bloco do corpo corrigido: do modelo (novo ou com `n`) ou preservado da versão. */
type Entry = { block: CorrectedBlock; fresh: boolean } | { block: Block; preserved: true };

/**
 * Corpo corrigido: os blocos do modelo, na ordem dele, com os blocos não gerados da versão
 * reinseridos depois do bloco que os precedia (ou do anterior que sobreviveu; no início, se
 * nenhum). `n` que não é de bloco gerável da versão vira `correction.block_unknown`.
 */
function mergeBlocks(
  version: ContentData,
  corrected: readonly CorrectedBlock[],
  allowed: ReadonlySet<string>,
): { ok: true; blocks: Entry[] } | { ok: false; issues: Issue[] } {
  const editable = new Set(
    version.blocks.filter((block) => allowed.has(block.type)).map((block) => block.n),
  );
  const issues: Issue[] = [];
  corrected.forEach((block, index) => {
    if (block.n !== undefined && !editable.has(block.n)) {
      issues.push({
        code: 'correction.block_unknown',
        message: `O bloco ${String(block.n)} não é um bloco de texto da versão corrigida`,
        path: ['blocks', index, 'n'],
      });
    }
  });
  if (issues.length > 0) return { ok: false, issues };

  const surviving = new Set(corrected.flatMap((block) => (block.n === undefined ? [] : [block.n])));
  // Âncora de cada bloco preservado: o último bloco gerável anterior a ele que sobreviveu.
  const groups = new Map<number | null, Block[]>();
  let anchor: number | null = null;
  for (const block of version.blocks) {
    if (allowed.has(block.type)) {
      if (surviving.has(block.n)) anchor = block.n;
      continue;
    }
    groups.set(anchor, [...(groups.get(anchor) ?? []), block]);
  }

  const preserved = (key: number | null) =>
    (groups.get(key) ?? []).map((block) => ({ block, preserved: true as const }));
  const placedAnchors = new Set<number>();
  const blocks: Entry[] = [...preserved(null)];
  for (const block of corrected) {
    if (block.n === undefined) {
      blocks.push({ block, fresh: true });
      continue;
    }
    blocks.push({ block, fresh: false });
    if (!placedAnchors.has(block.n)) {
      placedAnchors.add(block.n);
      blocks.push(...preserved(block.n));
    }
  }
  return { ok: true, blocks };
}

/** Artigo corrigido sobre a versão N: slug, autores, taxonomias, capa e datas não mudam. */
function assemble(
  input: CorrectionInput,
  corrected: Corrected,
  allowed: ReadonlySet<string>,
): { ok: true; content: ContentEdit } | { ok: false; issues: Issue[] } {
  const { version } = input;
  const merged = mergeBlocks(version, corrected.blocks, allowed);
  if (!merged.ok) return merged;

  // `n` provisórios nos blocos novos, só para validar: o definitivo vem da gravação.
  let provisional = Math.max(0, ...version.blocks.map((block) => block.n)) + 1;
  const fresh = new Set<number>();
  const blocks = merged.blocks.map((entry) => {
    if ('preserved' in entry) return entry.block;
    if (!entry.fresh) return entry.block;
    fresh.add(provisional);
    return { ...entry.block, n: provisional++ };
  });

  const seo = {
    ...version.seo,
    ...(corrected.seo?.title === undefined ? {} : { title: corrected.seo.title }),
    ...(corrected.seo?.description === undefined ? {} : { description: corrected.seo.description }),
  };
  const candidate: Partial<Content> = {
    ...version,
    title: corrected.title,
    description: corrected.description,
    blocks: blocks as Block[],
  };
  if (Object.keys(seo).length > 0) candidate.seo = seo;
  else delete candidate.seo;

  const parsed = ContentSchema.safeParse({ ...candidate, id: 1 });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({
      code: `schema.${issue.code}`,
      message: issue.message,
      path: issue.path,
    }));
    return { ok: false, issues };
  }
  const semantic = validateContent(parsed.data, versionReferences(version), input.resources);
  if (!semantic.ok) return semantic;

  const editBlocks = semantic.value.blocks.map((block): EditBlock => {
    if (!fresh.has(block.n)) return block;
    const fields: Record<string, unknown> = { ...block, new: true };
    delete fields.n;
    return fields as EditBlock;
  });
  const content: Partial<Content> = { ...semantic.value };
  delete content.id;
  return { ok: true, content: { ...(content as Omit<Content, 'id'>), blocks: editBlocks } };
}

/**
 * Corrige a versão devolvida com uma única chamada ao modelo (sem retentativa, nem as internas
 * do SDK). Saída fora do schema, reprovada na validação ou erro do provedor volta como falha,
 * com os mesmos dados de execução de um sucesso.
 */
export async function correct(
  input: CorrectionInput,
  settings: GenerationSettings,
): Promise<CorrectionResult> {
  const { model, pricing } = settings;
  const types = generatedBlockTypes(input.resources);
  const allowed = new Set<string>(types);
  const prompt = buildCorrectionPrompt(input, types);
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
          code: 'correction.no_block_types',
          message: 'A release do site não suporta nenhum tipo de bloco que a correção produz',
          path: ['blocks'],
        },
      ],
    };
  }

  let generated;
  try {
    generated = await generateObject({
      model: model.languageModel,
      schema: correctionSchema([first, ...rest]),
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
  const assembled = assemble(input, generated.object, allowed);
  return assembled.ok
    ? { ...execution, ok: true, content: assembled.content }
    : { ...execution, ok: false, issues: assembled.issues };
}
