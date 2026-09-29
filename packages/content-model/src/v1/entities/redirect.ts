import * as z from 'zod';

import { HrefSchema, IdSchema, PathSchema } from '../common.ts';

/** Códigos aceitos pelo `_redirects` do Workers Static Assets (não há 410). */
export const REDIRECT_STATUSES = [301, 302, 303, 307, 308] as const;

export const RedirectSchema = z.object({
  id: IdSchema,
  from: PathSchema,
  to: HrefSchema,
  status: z.union(REDIRECT_STATUSES.map((status) => z.literal(status))),
  /** `manual` ou criado pela troca de slug. */
  origin: z.enum(['manual', 'slug-change']),
});

export type Redirect = z.infer<typeof RedirectSchema>;
