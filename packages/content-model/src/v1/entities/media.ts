import * as z from 'zod';

import { IdSchema } from '../common.ts';

/**
 * Variante de uma imagem, com nome imutável no bucket de mídia do site. O formato é
 * texto (não enum) para que uma release antiga ignore formatos novos em vez de falhar;
 * a regra `supported-resources` exige as variantes do perfil de imagem.
 */
export const MediaVariantSchema = z.object({
  width: z.number().int().positive(),
  format: z.string().min(1),
  /** Caminho relativo a `media.<domínio>`. */
  path: z.string().regex(/^[^/\s][^\s]*$/, 'Use um caminho relativo, sem barra inicial'),
});

export const MediaSchema = z.object({
  id: IdSchema,
  /** Dimensões do original normalizado. */
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  variants: z.array(MediaVariantSchema).min(1),
});

export type Media = z.infer<typeof MediaSchema>;
