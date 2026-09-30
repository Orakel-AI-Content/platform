// wrangler.jsonc de cada site, por alvo, a partir da base do Worker (apps/blog/worker),
// por convenção de nomes — sem saída do OpenTofu (ADR 0004 da unidade).
//
// - cloudflare: Worker `orakel-<site>`, domínio personalizado, Analytics Engine; nunca
//   ALLOW_COUNTRY_OVERRIDE nem o ae-sim.
// - local: Worker `orakel-<site>` no edge-local; EVENTS vira service binding do ae-sim e o
//   cabeçalho X-Test-Country é aceito (testes de região).
import { z } from 'zod';

import { parseJsonc } from './jsonc.ts';

export const BaseConfigSchema = z.looseObject({
  main: z.string(),
  compatibility_date: z.string(),
  assets: z.looseObject({
    binding: z.string(),
    run_worker_first: z.array(z.string()),
    html_handling: z.string(),
    not_found_handling: z.string(),
  }),
  analytics_engine_datasets: z.array(z.object({ binding: z.string(), dataset: z.string() })),
  vars: z.record(z.string(), z.string()),
});
export type BaseConfig = z.infer<typeof BaseConfigSchema>;

export type TargetInput = {
  site: string;
  /** Domínio principal do site (primeiro da configuração). */
  domain: string;
  /** Caminho absoluto do src/index.ts do Worker dentro da imagem. */
  workerMain: string;
  /** Pasta do artefato, relativa ao arquivo gerado (fica em /build). */
  assetsDir: string;
};

export const AE_SIM_SERVICE = 'ae-sim';

export function workerName(site: string): string {
  return `orakel-${site}`;
}

export function readBaseConfig(text: string): BaseConfig {
  return BaseConfigSchema.parse(parseJsonc(text));
}

function omit<T extends Record<string, unknown>>(object: T, key: string): T {
  return Object.fromEntries(Object.entries(object).filter(([name]) => name !== key)) as T;
}

function common(base: BaseConfig, input: TargetInput) {
  return {
    ...omit(base, '$schema'),
    name: workerName(input.site),
    main: input.workerMain,
    assets: { ...base.assets, directory: input.assetsDir },
  };
}

export function cloudflareConfig(base: BaseConfig, input: TargetInput): Record<string, unknown> {
  return {
    ...common(base, input),
    routes: [{ pattern: input.domain, custom_domain: true }],
    vars: { ...omit(base.vars, 'ALLOW_COUNTRY_OVERRIDE'), SITE_ID: input.site },
  };
}

export function localConfig(base: BaseConfig, input: TargetInput): Record<string, unknown> {
  const { analytics_engine_datasets: datasets, ...rest } = common(base, input);
  return {
    ...rest,
    services: datasets.map((dataset) => ({ binding: dataset.binding, service: AE_SIM_SERVICE })),
    vars: { ...base.vars, SITE_ID: input.site, ALLOW_COUNTRY_OVERRIDE: 'true' },
  };
}

export function renderConfig(config: Record<string, unknown>, target: string): string {
  return `// Gerado pelo render do site-builder (alvo ${target}); não edite.\n${JSON.stringify(config, null, 2)}\n`;
}
