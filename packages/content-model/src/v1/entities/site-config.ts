import * as z from 'zod';

import { RichTextSchema } from '../blocks/rich-text.ts';
import { HostnameSchema, LanguageSchema, SlugSchema, TimeZoneSchema } from '../common.ts';

// Configuração de um site. Tudo que varia entre sites é campo aqui, nunca
// `if (siteId === …)` no código. Presets e variantes são conferidos contra os recursos
// da release do site pela validação semântica (`supported-resources`), não pelo schema.

/** Preset escolhido para cada tipo de página. */
export const SitePresetsSchema = z.object({
  home: SlugSchema,
  artigo: SlugSchema,
  categoria: SlugSchema,
  autor: SlugSchema,
});

/** Variante escolhida para cada componente. */
export const SiteVariantsSchema = z.object({
  articleCard: SlugSchema,
});

/** Sobrescrita da lista de crawlers da plataforma (user-agents) para o `robots.txt`. */
export const CrawlerOverrideSchema = z.object({
  allow: z.array(z.string().min(1)).optional(),
  block: z.array(z.string().min(1)).optional(),
});

/** Textos das páginas institucionais, configuráveis por site. */
export const InstitutionalTextsSchema = z.object({
  about: RichTextSchema.optional(),
  contact: RichTextSchema.optional(),
  terms: RichTextSchema.optional(),
  privacy: RichTextSchema.optional(),
  editorialPolicy: RichTextSchema.optional(),
});

export const Ga4IntegrationSchema = z
  .object({
    enabled: z.boolean(),
    measurementId: z
      .string()
      .regex(/^G-[A-Z0-9]+$/, 'Use o ID de medição do GA4 (G-XXXX)')
      .optional(),
  })
  .superRefine((ga4, ctx) => {
    if (ga4.enabled && ga4.measurementId === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['measurementId'],
        message: 'GA4 ligado exige o ID de medição',
      });
    }
  });

export const IntegrationsSchema = z.object({
  ga4: Ga4IntegrationSchema,
});

export const SiteConfigSchema = z.object({
  /** `SITE_ID`: identifica o site no build e na visualização. */
  siteId: SlugSchema,
  name: z.string().min(1),
  /** O primeiro é o domínio principal (canonical). */
  domains: z.array(HostnameSchema).min(1),
  language: LanguageSchema,
  /** Só para formatar as datas exibidas. */
  timeZone: TimeZoneSchema,
  /** Desligado: `noindex` em todas as respostas. */
  indexavel: z.boolean(),
  /** ID do tema em `@orakel/tokens`. */
  theme: SlugSchema,
  presets: SitePresetsSchema,
  variants: SiteVariantsSchema,
  featureFlags: z.record(z.string().regex(/^[a-z][a-zA-Z0-9]*$/), z.boolean()),
  crawlers: CrawlerOverrideSchema.optional(),
  institutionalTexts: InstitutionalTextsSchema.optional(),
  integrations: IntegrationsSchema,
});

export type SiteConfig = z.infer<typeof SiteConfigSchema>;
