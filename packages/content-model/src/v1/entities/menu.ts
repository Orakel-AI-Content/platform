import * as z from 'zod';

import { HrefSchema, IdSchema, SlugSchema } from '../common.ts';

export const MenuItemSchema = z.object({
  label: z.string().min(1),
  href: HrefSchema,
});

export const MenuSchema = z.object({
  id: IdSchema,
  /** Onde o menu aparece (ex.: `principal`, `rodape`). */
  key: SlugSchema,
  items: z.array(MenuItemSchema).min(1),
});

export type Menu = z.infer<typeof MenuSchema>;
