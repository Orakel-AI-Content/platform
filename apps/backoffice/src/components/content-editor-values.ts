import {
  ContentSchema,
  FaqBlockSchema,
  ImageBlockSchema,
  QuoteBlockSchema,
  TextBlockSchema,
  TocBlockSchema,
  type Block,
  type Content,
} from '@orakel/content-model/v1';
import * as z from 'zod';

import type { ContentEdit } from '@/domain/content/contents.ts';

import { clean, emptyValue } from './forms/schema-walk.ts';

// Valores do editor de conteúdo (#45): metadados pelo schema do conteúdo e cada bloco pelo
// schema do seu tipo. Bloco novo vai com `new: true` e sem `n` (o servidor numera).

/** Metadados: o conteúdo sem ID e sem blocos. */
export const ContentMetaSchema = ContentSchema.omit({ id: true, blocks: true });

export const BLOCK_SCHEMAS: Record<Block['type'], z.ZodType> = {
  text: TextBlockSchema,
  toc: TocBlockSchema,
  quote: QuoteBlockSchema,
  image: ImageBlockSchema,
  faq: FaqBlockSchema,
};

export const isBlockType = (type: unknown): type is Block['type'] =>
  typeof type === 'string' && Object.hasOwn(BLOCK_SCHEMAS, type);

type Raw = Record<string, unknown>;

/** Bloco do editor: validado pelo schema do tipo; o `n` provisório só serve para validar. */
const EditorBlockSchema = z.looseObject({ type: z.string() }).superRefine((block, ctx) => {
  if (!isBlockType(block.type)) {
    ctx.addIssue({ code: 'custom', path: ['type'], message: 'Tipo de bloco desconhecido' });
    return;
  }
  const raw: Raw = { ...block, n: typeof block.n === 'number' ? block.n : 1 };
  delete raw.new;
  const parsed = BLOCK_SCHEMAS[block.type].safeParse(raw);
  if (parsed.success) return;
  for (const issue of parsed.error.issues) {
    ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message });
  }
});

/** Schema do formulário inteiro (resolver do react-hook-form). */
export const ContentEditorSchema = z
  .unknown()
  .transform((value) => {
    const record = (value ?? {}) as Raw;
    const blocks = Array.isArray(record.blocks) ? (record.blocks as Raw[]) : [];
    return {
      ...(clean(ContentMetaSchema, record) as Raw),
      blocks: blocks.map((block) =>
        isBlockType(block.type) ? clean(BLOCK_SCHEMAS[block.type], block) : block,
      ),
    };
  })
  .pipe(
    ContentMetaSchema.extend({
      blocks: z.array(EditorBlockSchema).min(1, 'Adicione ao menos um bloco'),
    }),
  ) as unknown as z.ZodType<ContentEdit>;

/** Bloco novo do tipo escolhido, com os valores iniciais do schema. */
export function newBlock(type: Block['type']): Raw {
  const value = emptyValue(BLOCK_SCHEMAS[type]) as Raw;
  delete value.n;
  return { ...value, type, new: true };
}

/** Retorno das Server Actions do editor (serializável; `path` aponta o campo). */
export type ContentFormIssue = { path: (string | number)[]; message: string };
export type ContentFormResult =
  | {
      ok: true;
      message: string;
      id: number;
      /** Na edição, a versão recém-salva relida do servidor (blocos novos com o `n` dele). */
      saved?: Omit<Content, 'id'>;
    }
  | { ok: false; message: string; issues: ContentFormIssue[] };
