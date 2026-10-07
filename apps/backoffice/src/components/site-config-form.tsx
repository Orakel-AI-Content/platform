'use client';

import {
  PAGE_TYPES,
  SiteConfigSchema,
  VARIANT_COMPONENTS,
  type SiteConfig,
} from '@orakel/content-model/v1';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { SchemaForm, type FieldRenderer } from '@/components/forms/schema-form';
import { choiceField, flagsField, linesField } from '@/components/forms/site-fields';
import type { SiteFormResult } from '@/components/site-config-form-values.ts';

type Options = { presets: Record<string, string[]>; variants: Record<string, string[]> };

const PAGE_TYPE_LABEL: Record<string, string> = {
  home: 'Home',
  artigo: 'Artigo',
  categoria: 'Categoria',
  autor: 'Autor',
};
const VARIANT_LABEL: Record<string, string> = { articleCard: 'Card de artigo' };

const LABELS: Record<string, string> = {
  siteId: 'ID',
  name: 'Nome',
  domains: 'Domínios',
  language: 'Idioma',
  timeZone: 'Fuso horário',
  indexavel: 'Indexável',
  theme: 'Tema',
  presets: 'Presets',
  ...Object.fromEntries(
    PAGE_TYPES.map((type) => [
      `presets.${type}`,
      `Preset da página ${PAGE_TYPE_LABEL[type] ?? type}`,
    ]),
  ),
  variants: 'Variantes',
  ...Object.fromEntries(
    VARIANT_COMPONENTS.map((c) => [`variants.${c}`, `Variante: ${VARIANT_LABEL[c] ?? c}`]),
  ),
  featureFlags: 'Recursos ligados',
  crawlers: 'Robôs (robots.txt)',
  'crawlers.allow': 'Permitir também',
  'crawlers.block': 'Bloquear também',
  integrations: 'Integrações',
  'integrations.ga4': 'GA4',
  'integrations.ga4.enabled': 'GA4 ligado',
  'integrations.ga4.measurementId': 'ID de medição do GA4',
};

const HINTS: Record<string, string> = {
  domains: 'Um por linha; o primeiro é o principal.',
  language: 'Tag BCP 47, ex.: pt-BR.',
  timeZone: 'Fuso IANA, ex.: America/Sao_Paulo.',
  indexavel: 'Desligado: noindex em todas as respostas. Ligar exige o G1 registrado.',
  theme: 'ID do tema em @orakel/tokens.',
  'crawlers.allow': 'User-agents, um por linha; vazio usa só a lista da plataforma.',
  'crawlers.block': 'User-agents, um por linha.',
};

/**
 * Formulário da configuração do site, para o cadastro e a edição (na edição o SITE_ID não
 * muda), gerado do SiteConfigSchema. A Server Action só delega ao domínio; as issues dele
 * voltam para o campo do `path` (com foco) e a mensagem geral para o resumo (role=alert).
 */
export function SiteConfigForm({
  mode,
  defaultValues,
  options,
  action,
}: {
  mode: 'create' | 'edit';
  defaultValues: Record<string, unknown>;
  options: Options;
  action: (config: SiteConfig) => Promise<SiteFormResult>;
}) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const fields: Record<string, FieldRenderer> = {
    domains: linesField(),
    featureFlags: flagsField(),
    'crawlers.allow': linesField({ rows: 2 }),
    'crawlers.block': linesField({ rows: 2 }),
    ...Object.fromEntries(
      Object.entries(options.presets).map(([type, values]) => [
        `presets.${type}`,
        choiceField(values),
      ]),
    ),
    ...Object.fromEntries(
      Object.entries(options.variants).map(([c, values]) => [`variants.${c}`, choiceField(values)]),
    ),
  };

  return (
    <div className="space-y-2">
      <SchemaForm
        schema={SiteConfigSchema}
        defaultValues={defaultValues}
        labels={LABELS}
        hints={{
          ...HINTS,
          siteId: mode === 'edit' ? 'Não muda depois do cadastro.' : 'kebab-case, ex.: meu-site.',
        }}
        hidden={['institutionalTexts']}
        readOnly={mode === 'edit' ? ['siteId'] : []}
        fields={fields}
        submitLabel={mode === 'create' ? 'Cadastrar site' : 'Salvar configuração'}
        onSubmit={async (config) => {
          setStatus('');
          const result = await action(config);
          if (!result.ok) return [...result.issues, { path: [], message: result.message }];
          if (mode === 'create') {
            router.push('/sites');
            router.refresh();
          } else {
            setStatus(result.message);
          }
        }}
      />
      <p role="status" className="text-sm text-muted-foreground">
        {status}
      </p>
    </div>
  );
}
