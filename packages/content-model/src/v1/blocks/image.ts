import * as z from 'zod';

import { IdSchema } from '../common.ts';
import { blockBase } from './base.ts';
import { InlinesSchema } from './rich-text.ts';

/**
 * Imagem de conteúdo. Toda imagem tem texto alternativo, ou é marcada como decorativa
 * (e então não tem alt) — WCAG 2.2 AA.
 */
export const ImageBlockSchema = z
  .object({
    ...blockBase,
    type: z.literal('image'),
    mediaId: IdSchema,
    alt: z.string().trim().min(1).optional(),
    decorative: z.boolean().optional(),
    caption: InlinesSchema.optional(),
  })
  .superRefine((block, ctx) => {
    if (block.decorative === true && block.alt !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['alt'],
        message: 'Imagem decorativa não tem texto alternativo',
      });
    }
    if (block.decorative !== true && block.alt === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['alt'],
        message: 'Informe o texto alternativo ou marque a imagem como decorativa',
      });
    }
  });

export type ImageBlock = z.infer<typeof ImageBlockSchema>;
