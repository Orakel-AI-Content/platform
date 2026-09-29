import * as z from 'zod';

import { IdSchema, SlugSchema } from '../common.ts';

export const TAXONOMY_KINDS = ['category', 'tag', 'series'] as const;

export const TaxonomySchema = z.object({
  id: IdSchema,
  kind: z.enum(TAXONOMY_KINDS),
  slug: SlugSchema,
  name: z.string().min(1),
  description: z.string().min(1).optional(),
});

export type Taxonomy = z.infer<typeof TaxonomySchema>;
