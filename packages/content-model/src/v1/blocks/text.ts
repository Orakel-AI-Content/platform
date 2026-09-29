import * as z from 'zod';

import { blockBase } from './base.ts';
import { RichTextSchema } from './rich-text.ts';

export const TextBlockSchema = z.object({
  ...blockBase,
  type: z.literal('text'),
  content: RichTextSchema,
});

export type TextBlock = z.infer<typeof TextBlockSchema>;
