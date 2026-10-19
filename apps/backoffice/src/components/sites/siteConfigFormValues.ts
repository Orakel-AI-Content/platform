import {
  PAGE_TYPES,
  VARIANT_COMPONENTS,
  type Resources,
  type SiteConfig,
} from '@orakel/content-model/v1';

import type { FormActionResult } from '@/components/shared/actionResult.ts';

// Valores do formulário de configuração do site: a própria SiteConfig (o gerador desenha os
// campos e os campos registrados convertem na borda). Os textos institucionais não passam
// pelo formulário: o domínio preserva os da versão corrente.

/** Retorno das Server Actions do formulário (serializável; `path` aponta o campo). */
export type SiteFormIssue = { path: (string | number)[]; message: string };
export type SiteFormResult = FormActionResult<SiteFormIssue>;

/** Valores iniciais do cadastro: a primeira opção de cada preset e variante dos recursos. */
export function emptySiteConfig(resources: Resources): Record<string, unknown> {
  const first = (options: string[] | undefined) => options?.[0] ?? '';
  return {
    siteId: '',
    name: '',
    domains: [],
    language: 'pt-BR',
    timeZone: 'America/Sao_Paulo',
    indexavel: false,
    theme: '',
    presets: Object.fromEntries(
      PAGE_TYPES.map((pageType) => [pageType, first(resources.presets[pageType])]),
    ),
    variants: Object.fromEntries(
      VARIANT_COMPONENTS.map((component) => [component, first(resources.variants[component])]),
    ),
    featureFlags: {},
    integrations: { ga4: { enabled: false } },
  };
}

/** Valores da edição: a configuração corrente sem os textos institucionais. */
export function editValues(config: SiteConfig): Record<string, unknown> {
  const values: Partial<SiteConfig> = { ...config };
  delete values.institutionalTexts;
  return values;
}
