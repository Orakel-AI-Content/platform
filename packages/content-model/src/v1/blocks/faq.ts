import * as z from 'zod';

import { blockBase } from './base.ts';
import { InlinesSchema } from './rich-text.ts';

export const FaqItemSchema = z.object({
  question: z.string().min(1),
  answer: InlinesSchema,
});

export const FaqBlockSchema = z.object({
  ...blockBase,
  type: z.literal('faq'),
  items: z.array(FaqItemSchema).min(1),
});

export type FaqBlock = z.infer<typeof FaqBlockSchema>;
