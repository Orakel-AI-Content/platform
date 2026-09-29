import * as z from 'zod';

import { HrefSchema } from '../common.ts';
import { blockBase } from './base.ts';
import { InlinesSchema } from './rich-text.ts';

export const QuoteBlockSchema = z.object({
  ...blockBase,
  type: z.literal('quote'),
  content: InlinesSchema,
  /** Quem disse ou escreveu. */
  attribution: z.string().min(1).optional(),
  sourceUrl: HrefSchema.optional(),
});

export type QuoteBlock = z.infer<typeof QuoteBlockSchema>;
