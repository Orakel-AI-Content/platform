import * as z from 'zod';

import { HrefSchema } from '../common.ts';

// Rich text restrito do bloco de texto: uma árvore própria e pequena, independente do
// editor do Backoffice (open_questions do spec da unidade). Só entra o que o site sabe
// renderizar; HTML livre nunca.

export const MARKS = ['bold', 'italic', 'code'] as const;

export const TextInlineSchema = z.object({
  type: z.literal('text'),
  text: z.string().min(1),
  marks: z.array(z.enum(MARKS)).optional(),
});

export const LinkInlineSchema = z.object({
  type: z.literal('link'),
  href: HrefSchema,
  children: z.array(TextInlineSchema).min(1),
});

export const InlineSchema = z.discriminatedUnion('type', [TextInlineSchema, LinkInlineSchema]);
export type Inline = z.infer<typeof InlineSchema>;

/** Sequência de trechos numa linha (parágrafo, item de lista, resposta de FAQ). */
export const InlinesSchema = z.array(InlineSchema).min(1);

export const ParagraphSchema = z.object({
  type: z.literal('paragraph'),
  children: InlinesSchema,
});

/** Intertítulo. O bloco `toc` do artigo é gerado dos intertítulos. */
export const HeadingSchema = z.object({
  type: z.literal('heading'),
  level: z.union([z.literal(2), z.literal(3)]),
  children: InlinesSchema,
});

export const ListSchema = z.object({
  type: z.literal('list'),
  ordered: z.boolean(),
  items: z.array(InlinesSchema).min(1),
});

export const RichTextNodeSchema = z.discriminatedUnion('type', [
  ParagraphSchema,
  HeadingSchema,
  ListSchema,
]);

export const RichTextSchema = z.array(RichTextNodeSchema).min(1);
export type RichText = z.infer<typeof RichTextSchema>;
