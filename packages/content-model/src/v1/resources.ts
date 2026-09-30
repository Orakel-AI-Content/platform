import * as z from 'zod';

import { SCHEMA_VERSION } from './version.ts';

/**
 * Recursos que uma release sabe renderizar. O backoffice valida conteúdo e configuração
 * contra os recursos da release registrada para o site (não os da `main`), por isso as
 * funções de validação semântica recebem um `Resources` em vez de usar sempre `RESOURCES`.
 *
 * Acrescentar um valor aqui é mudança aditiva da v1 e entra no PR que o implementa
 * no site (ADR 0002). Valores escolhidos na configuração ficam em português (ADR 0004).
 */
export const ResourcesSchema = z.object({
  schemaVersion: z.number().int().positive(),
  blockTypes: z.array(z.string().min(1)).min(1),
  /** Presets suportados por tipo de página. */
  presets: z.record(z.string().min(1), z.array(z.string().min(1)).min(1)),
  /** Variantes suportadas por componente. */
  variants: z.record(z.string().min(1), z.array(z.string().min(1)).min(1)),
  imageProfile: z.object({
    widths: z.array(z.number().int().positive()).min(1),
    formats: z.array(z.string().min(1)).min(1),
  }),
});

export type Resources = z.infer<typeof ResourcesSchema>;

export const BLOCK_TYPES = ['text', 'toc', 'quote', 'image', 'faq'] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const PAGE_TYPES = ['home', 'artigo', 'categoria', 'autor'] as const;
export type PageType = (typeof PAGE_TYPES)[number];

/** Componentes cuja apresentação o site escolhe por variante. */
export const VARIANT_COMPONENTS = ['articleCard'] as const;
export type VariantComponent = (typeof VARIANT_COMPONENTS)[number];

/** Recursos da v1 no código atual. */
export const RESOURCES = {
  schemaVersion: SCHEMA_VERSION,
  blockTypes: [...BLOCK_TYPES],
  presets: {
    home: ['padrao', 'revista'],
    artigo: ['padrao', 'revista'],
    categoria: ['padrao', 'revista'],
    autor: ['padrao', 'revista'],
  },
  variants: {
    articleCard: ['vertical', 'horizontal'],
  },
  // Perfil de imagem v1 (proposta): calibrado na fase 0.
  imageProfile: {
    widths: [320, 640, 960, 1280, 1920],
    formats: ['avif', 'webp'],
  },
} satisfies Resources & {
  presets: Record<PageType, string[]>;
  variants: Record<VariantComponent, string[]>;
};
