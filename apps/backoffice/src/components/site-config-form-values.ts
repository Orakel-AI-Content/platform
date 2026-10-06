import {
  PAGE_TYPES,
  SiteConfigSchema,
  VARIANT_COMPONENTS,
  type PageType,
  type Resources,
  type SiteConfig,
  type VariantComponent,
} from '@orakel/content-model/v1';
import * as z from 'zod';

// Valores do formulário de configuração do site e a conversão de/para a SiteConfig. As
// listas (domínios, robôs) são um item por linha; as feature flags, pares nome/ligado. Os
// textos institucionais não passam pelo formulário: o domínio preserva os da versão
// corrente.

export type SiteConfigFormValues = {
  siteId: string;
  name: string;
  domains: string;
  language: string;
  timeZone: string;
  indexavel: boolean;
  theme: string;
  presets: Record<PageType, string>;
  variants: Record<VariantComponent, string>;
  featureFlags: { name: string; enabled: boolean }[];
  crawlers: { allow: string; block: string };
  integrations: { ga4: { enabled: boolean; measurementId: string } };
};

const lines = (text: string): string[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

/** Retorno das Server Actions do formulário (serializável; `path` aponta o campo). */
export type SiteFormIssue = { path: (string | number)[]; message: string };
export type SiteFormResult =
  { ok: true; message: string } | { ok: false; message: string; issues: SiteFormIssue[] };

/** Formulário → SiteConfig (sem validar; a validação é a do SiteConfigSchema). */
export function toSiteConfig(values: SiteConfigFormValues): SiteConfig {
  const allow = lines(values.crawlers.allow);
  const block = lines(values.crawlers.block);
  const measurementId = values.integrations.ga4.measurementId.trim();
  return {
    siteId: values.siteId.trim(),
    name: values.name.trim(),
    domains: lines(values.domains),
    language: values.language.trim(),
    timeZone: values.timeZone.trim(),
    indexavel: values.indexavel,
    theme: values.theme.trim(),
    presets: { ...values.presets },
    variants: { ...values.variants },
    featureFlags: Object.fromEntries(
      values.featureFlags
        .filter((flag) => flag.name.trim() !== '')
        .map((flag) => [flag.name.trim(), flag.enabled]),
    ),
    ...(allow.length > 0 || block.length > 0
      ? {
          crawlers: {
            ...(allow.length > 0 ? { allow } : {}),
            ...(block.length > 0 ? { block } : {}),
          },
        }
      : {}),
    integrations: {
      ga4: {
        enabled: values.integrations.ga4.enabled,
        ...(measurementId !== '' ? { measurementId } : {}),
      },
    },
  };
}

/** SiteConfig → formulário (edição). Os textos institucionais ficam de fora. */
export function toFormValues(config: SiteConfig): SiteConfigFormValues {
  return {
    siteId: config.siteId,
    name: config.name,
    domains: config.domains.join('\n'),
    language: config.language,
    timeZone: config.timeZone,
    indexavel: config.indexavel,
    theme: config.theme,
    presets: { ...config.presets },
    variants: { ...config.variants },
    featureFlags: Object.entries(config.featureFlags).map(([name, enabled]) => ({
      name,
      enabled,
    })),
    crawlers: {
      allow: (config.crawlers?.allow ?? []).join('\n'),
      block: (config.crawlers?.block ?? []).join('\n'),
    },
    integrations: {
      ga4: {
        enabled: config.integrations.ga4.enabled,
        measurementId: config.integrations.ga4.measurementId ?? '',
      },
    },
  };
}

/** Valores iniciais do cadastro: a primeira opção de cada preset e variante dos recursos. */
export function emptyFormValues(resources: Resources): SiteConfigFormValues {
  const first = (options: string[] | undefined) => options?.[0] ?? '';
  return {
    siteId: '',
    name: '',
    domains: '',
    language: 'pt-BR',
    timeZone: 'America/Sao_Paulo',
    indexavel: false,
    theme: '',
    presets: Object.fromEntries(
      PAGE_TYPES.map((pageType) => [pageType, first(resources.presets[pageType])]),
    ) as Record<PageType, string>,
    variants: Object.fromEntries(
      VARIANT_COMPONENTS.map((component) => [component, first(resources.variants[component])]),
    ) as Record<VariantComponent, string>,
    featureFlags: [],
    crawlers: { allow: '', block: '' },
    integrations: { ga4: { enabled: false, measurementId: '' } },
  };
}

/** Schema do formulário para o zodResolver: converte e valida pelo SiteConfigSchema. */
export const SiteConfigFormSchema = z
  .custom<SiteConfigFormValues>()
  .transform(toSiteConfig)
  .pipe(SiteConfigSchema);

/** Campos do formulário que recebem erro (o resto vai para o topo). */
export type FormField =
  | 'siteId'
  | 'name'
  | 'domains'
  | 'language'
  | 'timeZone'
  | 'indexavel'
  | 'theme'
  | `presets.${PageType}`
  | `variants.${VariantComponent}`
  | 'featureFlags'
  | 'crawlers.allow'
  | 'crawlers.block'
  | 'integrations.ga4.enabled'
  | 'integrations.ga4.measurementId';

const TOP_LEVEL: readonly string[] = [
  'siteId',
  'name',
  'domains',
  'language',
  'timeZone',
  'indexavel',
  'theme',
  'featureFlags',
];

/**
 * Campo do formulário para o `path` de uma issue (do schema ou do domínio). `undefined`:
 * sem campo correspondente, a mensagem vai para o topo do formulário.
 */
export function fieldForPath(path: readonly PropertyKey[]): FormField | undefined {
  const [first, second, third] = path.map(String);
  if (first === undefined) return undefined;
  if (TOP_LEVEL.includes(first)) return first as FormField;
  if (first === 'presets' && (PAGE_TYPES as readonly string[]).includes(second ?? '')) {
    return `presets.${second as PageType}`;
  }
  if (first === 'variants' && (VARIANT_COMPONENTS as readonly string[]).includes(second ?? '')) {
    return `variants.${second as VariantComponent}`;
  }
  if (first === 'crawlers' && (second === 'allow' || second === 'block')) {
    return `crawlers.${second}`;
  }
  if (first === 'integrations' && second === 'ga4') {
    return third === 'measurementId'
      ? 'integrations.ga4.measurementId'
      : 'integrations.ga4.enabled';
  }
  return undefined;
}
