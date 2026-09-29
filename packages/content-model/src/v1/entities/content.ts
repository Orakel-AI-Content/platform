import * as z from 'zod';

import { BlockSchema } from '../blocks/index.ts';
import { HrefSchema, IdSchema, IsoDateTimeSchema, SlugSchema } from '../common.ts';

export const CONTENT_KINDS = ['article', 'page'] as const;

export const SeoSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  canonical: HrefSchema.optional(),
});

/** Artigo ou página publicada de um único site. O corpo é uma sequência de blocos. */
export const ContentSchema = z.object({
  /** ID numérico estável: entra no identificador de reconciliação de afiliados. */
  id: IdSchema,
  kind: z.enum(CONTENT_KINDS),
  slug: SlugSchema,
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  authorIds: z.array(IdSchema),
  taxonomyIds: z.array(IdSchema),
  coverMediaId: IdSchema.optional(),
  publishedAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema.optional(),
  seo: SeoSchema.optional(),
  blocks: z.array(BlockSchema).min(1),
});

export type Content = z.infer<typeof ContentSchema>;
