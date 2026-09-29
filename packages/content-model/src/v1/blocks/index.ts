import * as z from 'zod';

import { FaqBlockSchema } from './faq.ts';
import { ImageBlockSchema } from './image.ts';
import { QuoteBlockSchema } from './quote.ts';
import { TextBlockSchema } from './text.ts';
import { TocBlockSchema } from './toc.ts';

/** Bloco do corpo de um conteúdo, discriminado por `type`. Tipo novo: arquivo aqui + `BLOCK_TYPES`. */
export const BlockSchema = z.discriminatedUnion('type', [
  TextBlockSchema,
  TocBlockSchema,
  QuoteBlockSchema,
  ImageBlockSchema,
  FaqBlockSchema,
]);

export type Block = z.infer<typeof BlockSchema>;

export * from './base.ts';
export * from './faq.ts';
export * from './image.ts';
export * from './quote.ts';
export * from './rich-text.ts';
export * from './text.ts';
export * from './toc.ts';
