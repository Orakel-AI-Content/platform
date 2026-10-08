// Subconjunto do formato DTCG (Design Tokens Format Module 2025.10) usado pelos temas,
// e o conjunto semântico fixo que todo tema define (ADR 0002 e 0005 da unidade).
import { z } from 'zod';

export type Issue = {
  /** Ex.: `schema.invalid_type`, `alias.missing`, `set.missing`, `contrast.below-minimum`. */
  code: string;
  message: string;
  /** Caminho do token (`color.text.muted`) ou do campo no arquivo do tema. */
  path: string;
};

export type Result<T> = { ok: true; value: T } | { ok: false; issues: Issue[] };

export const TOKEN_TYPES = ['color', 'dimension', 'fontFamily', 'number', 'shadow'] as const;
export type TokenType = (typeof TOKEN_TYPES)[number];

/** Referência a outro token: `{palette.blue.600}`. */
export const ALIAS = /^\{([^{}]+)\}$/;

const unit = z.number().min(0).max(1);

export const ColorSchema = z
  .strictObject({
    colorSpace: z.literal('srgb'),
    components: z.tuple([unit, unit, unit]),
    alpha: unit.optional(),
    /** Opcional no DTCG; se presente, precisa bater com `components`. */
    hex: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
  })
  .refine((color) => color.hex === undefined || color.hex.toLowerCase() === toHex(color), {
    message: 'hex não corresponde a components',
    path: ['hex'],
  });
export type Color = z.infer<typeof ColorSchema>;

/** `#rrggbb` a partir dos componentes sRGB (0–1), sem alfa. */
export function toHex(color: { components: readonly [number, number, number] }): string {
  return `#${color.components
    .map((c) =>
      Math.round(c * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

export const DimensionSchema = z.strictObject({
  value: z.number(),
  unit: z.enum(['px', 'rem']),
});
export type Dimension = z.infer<typeof DimensionSchema>;

export const FontFamilySchema = z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]);
export type FontFamily = z.infer<typeof FontFamilySchema>;

export const ShadowLayerSchema = z.strictObject({
  color: ColorSchema,
  offsetX: DimensionSchema,
  offsetY: DimensionSchema,
  blur: DimensionSchema,
  spread: DimensionSchema,
  inset: z.boolean().optional(),
});
export const ShadowSchema = z.union([ShadowLayerSchema, z.array(ShadowLayerSchema).min(1)]);
export type ShadowLayer = z.infer<typeof ShadowLayerSchema>;
export type Shadow = z.infer<typeof ShadowSchema>;

export const VALUE_SCHEMAS = {
  color: ColorSchema,
  dimension: DimensionSchema,
  fontFamily: FontFamilySchema,
  number: z.number(),
  shadow: ShadowSchema,
} satisfies Record<TokenType, z.ZodType>;

export type TokenValue = {
  color: Color;
  dimension: Dimension;
  fontFamily: FontFamily;
  number: number;
  shadow: Shadow;
};

export type ResolvedToken = {
  [K in TokenType]: { path: string; type: K; value: TokenValue[K] };
}[TokenType];

/** Extensão da plataforma no arquivo do tema (`$extensions`, notação de domínio reverso). */
export const EXTENSION = 'ai.orakel.theme';

export const FontFaceSchema = z.strictObject({
  family: z.string().min(1),
  /** Arquivo em `themes/<id>/fonts/`. */
  file: z.string().regex(/^[a-z0-9-]+\.woff2$/),
  /** Um peso (`400`) ou o intervalo de uma fonte variável (`"100 900"`). */
  weight: z.union([z.number().int().min(1).max(1000), z.string().regex(/^\d{1,4} \d{1,4}$/)]),
  style: z.enum(['normal', 'italic']),
  /** Só a fonte do texto: o blog põe `<link rel="preload">`. */
  preload: z.boolean(),
});
export type FontFace = z.infer<typeof FontFaceSchema>;

export const ThemeExtensionSchema = z.strictObject({
  /** Nome legível do tema, para quem escolhe (ex.: seletor do Backoffice). */
  name: z.string().min(1),
  colorScheme: z.enum(['light', 'dark']),
  fontFaces: z.array(FontFaceSchema),
});
export type ThemeExtension = z.infer<typeof ThemeExtensionSchema>;

/** Grupo de primitivos: usado só por aliases, nunca vira variável CSS. */
export const PRIMITIVE_GROUP = 'palette';

const scale = ['sm', 'md', 'lg', 'xl', '2xl', '3xl'] as const;

/** Conjunto semântico fixo: todo tema define exatamente estes tokens, com estes tipos. */
export const SEMANTIC_TOKENS: Readonly<Record<string, TokenType>> = Object.freeze({
  ...Object.fromEntries(
    [
      'background',
      'surface',
      'text',
      'text-muted',
      'link',
      'accent',
      'on-accent',
      'focus',
      'border',
    ].map((name) => [`color.${name}`, 'color']),
  ),
  ...Object.fromEntries(
    ['body', 'heading', 'mono'].map((name) => [`font.family.${name}`, 'fontFamily']),
  ),
  ...Object.fromEntries(scale.map((step) => [`font.size.${step}`, 'dimension'])),
  ...Object.fromEntries(scale.map((step) => [`font.line-height.${step}`, 'number'])),
  ...Object.fromEntries(
    ['1', '2', '3', '4', '5', '6', '7', '8'].map((step) => [`space.${step}`, 'dimension']),
  ),
  ...Object.fromEntries(['sm', 'md', 'lg', 'full'].map((step) => [`radius.${step}`, 'dimension'])),
  ...Object.fromEntries(['sm', 'md'].map((step) => [`shadow.${step}`, 'shadow'])),
} satisfies Record<string, TokenType>);
