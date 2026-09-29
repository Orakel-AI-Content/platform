import * as z from 'zod';

import { blockBase } from './base.ts';

/** Sumário. Os itens são gerados no build a partir dos intertítulos dos blocos de texto. */
export const TocBlockSchema = z.object({
  ...blockBase,
  type: z.literal('toc'),
  title: z.string().min(1).optional(),
});

export type TocBlock = z.infer<typeof TocBlockSchema>;
