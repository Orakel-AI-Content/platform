import * as z from 'zod';

import { IdSchema, SlugSchema } from '../common.ts';

/** Autor real do site, com página própria (E-E-A-T). Pertence a um único site. */
export const AuthorSchema = z.object({
  id: IdSchema,
  slug: SlugSchema,
  name: z.string().min(1),
  bio: z.string().min(1).optional(),
  /** Área de atuação. */
  expertise: z.string().min(1).optional(),
  avatarMediaId: IdSchema.optional(),
});

export type Author = z.infer<typeof AuthorSchema>;
