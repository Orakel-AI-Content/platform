// Contrato do volume /build entre o render, o publish e o build-runner do backoffice
// (ADR 0002 do build-site). Pacote à parte, só com Zod, para quem lê o volume não levar as
// dependências do site-builder (astro, wrangler) para a própria imagem.
//
//   /build/site/                     artefato estático
//   /build/wrangler.cloudflare.jsonc alvo de produção
//   /build/wrangler.local.jsonc      alvo do edge-local
//   /build/result.json               escrito pelo render, sempre
//   /build/publish.json              escrito pelo publish
//   /build/rollback.json             escrito pelo rollback
//
// No fim, o contrato do volume /infra da imagem infra-runner (ADR 0027 da raiz).
import { z } from 'zod';

export const CONTRACT_VERSION = 1;
export const BUILD_DIR = '/build';
export const PATHS = {
  site: 'site',
  wranglerCloudflare: 'wrangler.cloudflare.jsonc',
  wranglerLocal: 'wrangler.local.jsonc',
  result: 'result.json',
  publish: 'publish.json',
  rollback: 'rollback.json',
} as const;

/** Código de saída de cada entrypoint; o `status`/`failure` do arquivo sempre concorda. */
export const EXIT_CODES = { ok: 0, permanent: 10, transient: 20 } as const;

/**
 * Entidades do snapshot que podem causar uma falha. Subconjunto das origens de
 * `pending_changes` do Backoffice (sem `release` nem `platform`, que não vêm do snapshot);
 * um teste do Backoffice garante que a lista continua contida lá.
 */
export const CULPRIT_ORIGINS = [
  'config',
  'content',
  'author',
  'taxonomy',
  'menu',
  'media',
  'redirect',
] as const;
export type CulpritOrigin = (typeof CULPRIT_ORIGINS)[number];

/** O conteúdo que causou a falha: origem e referência, como em `pending_changes`. */
export const CulpritSchema = z.object({
  origin: z.enum(CULPRIT_ORIGINS),
  /** `String(id)`; a `key` no caso de `menu`; `'config'` para a configuração do site. */
  reference: z.string().min(1),
});
export type Culprit = z.infer<typeof CulpritSchema>;

export const FailureSchema = z.object({
  kind: z.enum(['permanent', 'transient']),
  message: z.string().min(1),
  /** Só quando a falha aponta um conteúdo; ausente em `result.json` antigo. */
  culprit: CulpritSchema.optional(),
});
export type Failure = z.infer<typeof FailureSchema>;

const RedirectUsageSchema = z.object({
  static: z.number().int().nonnegative(),
  dynamic: z.number().int().nonnegative(),
  limits: z.object({ static: z.number().int(), dynamic: z.number().int() }),
  alert: z.boolean(),
});

const ResultBase = {
  formatVersion: z.literal(CONTRACT_VERSION),
  site: z.string().min(1),
  release: z.string().min(1),
  durationMs: z.number().int().nonnegative(),
};

export const ResultSchema = z.discriminatedUnion('status', [
  z.object({
    ...ResultBase,
    status: z.literal('ok'),
    /** Mudanças visíveis no snapshot: o build-runner as baixa por esta lista. */
    pendingChangeIds: z.array(z.number().int().positive()),
    pages: z.number().int().nonnegative(),
    files: z.number().int().nonnegative(),
    redirectUsage: RedirectUsageSchema,
  }),
  z.object({ ...ResultBase, status: z.literal('failed'), failure: FailureSchema }),
]);
export type Result = z.infer<typeof ResultSchema>;

export const PublishResultSchema = z.discriminatedUnion('status', [
  z.object({
    formatVersion: z.literal(CONTRACT_VERSION),
    status: z.literal('ok'),
    site: z.string().min(1),
    target: z.enum(['cloudflare', 'local']),
    /** Versão publicada do Worker: é o que o rollback do backoffice usa. */
    versionId: z.string().min(1),
    /** Objeto no bucket build-cache com a saída compactada. */
    cacheKey: z.string().min(1),
    durationMs: z.number().int().nonnegative(),
  }),
  z.object({
    formatVersion: z.literal(CONTRACT_VERSION),
    status: z.literal('failed'),
    site: z.string().min(1),
    failure: FailureSchema,
    durationMs: z.number().int().nonnegative(),
  }),
]);
export type PublishResult = z.infer<typeof PublishResultSchema>;

/** Resultado do rollback: a versão que ficou ativa no alvo (ADR 0009 do build-site). */
export const RollbackResultSchema = z.discriminatedUnion('status', [
  z.object({
    formatVersion: z.literal(CONTRACT_VERSION),
    status: z.literal('ok'),
    site: z.string().min(1),
    target: z.enum(['cloudflare', 'local']),
    /** Versão ativa depois do rollback: a pedida em `VERSION_ID`. */
    versionId: z.string().min(1),
    durationMs: z.number().int().nonnegative(),
  }),
  z.object({
    formatVersion: z.literal(CONTRACT_VERSION),
    status: z.literal('failed'),
    site: z.string().min(1),
    failure: FailureSchema,
    durationMs: z.number().int().nonnegative(),
  }),
]);
export type RollbackResult = z.infer<typeof RollbackResultSchema>;

/**
 * Conteúdo do tar.gz do publish (edge-local e build-cache): o artefato, o Worker já
 * empacotado (o mesmo bundle da release) e o wrangler.jsonc do alvo apontando para ele.
 */
export const ARCHIVE_LAYOUT = {
  site: 'site',
  worker: 'worker/index.js',
  config: 'wrangler.jsonc',
} as const;

/**
 * Nome do Worker do site, o mesmo nos dois alvos: o `name` do wrangler.jsonc gerado, o do
 * `wrangler rollback`, o que o edge-local confere no publish e o script que a remoção apaga.
 */
export function workerName(site: string): string {
  return `orakel-${site}`;
}

/** Resposta do `PUT /sites/{site}/versions` do edge-local (12.0, L3). */
export const EdgeLocalVersionSchema = z.object({ id: z.string().min(1) });

/** Resposta do `POST /sites/{site}/rollback` do edge-local: a versão que ficou ativa. */
export const EdgeLocalRollbackSchema = z.object({ active: z.string().min(1) });

export function exitCodeOf(result: { status: 'ok' } | { status: 'failed'; failure: Failure }) {
  return result.status === 'ok' ? EXIT_CODES.ok : EXIT_CODES[result.failure.kind];
}

// Contrato do volume /infra entre a imagem infra-runner (plan e apply da raiz OpenTofu de um
// site) e o build-runner do backoffice (ADR 0027 da raiz). Volume próprio da execução, nunca o
// /build: os containers de site e de infra não compartilham volume.
//
//   /infra/site.tfplan       plano salvo, cifrado (aes_gcm), escrito pelo plan
//   /infra/infra-plan.json   escrito pelo plan, sempre
//   /infra/infra-apply.json  escrito pelo apply, sempre
//
// O andamento (`tofu … -json`) sai no stdout; os arquivos só trazem o resultado.

export const INFRA_DIR = '/infra';
export const INFRA_PATHS = {
  plan: 'site.tfplan',
  planResult: 'infra-plan.json',
  applyResult: 'infra-apply.json',
} as const;

/** Ação do recurso no plano; `replace` = destruir e criar (ou criar e destruir). */
export const INFRA_ACTIONS = ['create', 'update', 'delete', 'replace'] as const;
export type InfraAction = (typeof INFRA_ACTIONS)[number];

/** Um recurso que o plano muda (`no-op` e `read` ficam fora do resumo). */
export const InfraChangeSchema = z.object({
  /** Endereço no OpenTofu, ex.: `module.site.cloudflare_zone.site`. */
  address: z.string().min(1),
  /** Tipo do recurso, ex.: `cloudflare_zone`. */
  type: z.string().min(1),
  action: z.enum(INFRA_ACTIONS),
});
export type InfraChange = z.infer<typeof InfraChangeSchema>;

const InfraBase = {
  formatVersion: z.literal(CONTRACT_VERSION),
  /** SITE_ID: também a chave do estado (`sites/<SITE_ID>.tfstate`). */
  site: z.string().min(1),
  durationMs: z.number().int().nonnegative(),
};

const InfraFailed = z.object({ ...InfraBase, status: z.literal('failed'), failure: FailureSchema });

/** Resultado do `plan`: o resumo do plano salvo, que é o que o `apply` aplica. */
export const InfraPlanResultSchema = z.discriminatedUnion('status', [
  z.object({
    ...InfraBase,
    status: z.literal('ok'),
    /** Recursos que mudam; vazio quando o site já está como o código descreve. */
    changes: z.array(InfraChangeSchema),
  }),
  InfraFailed,
]);
export type InfraPlanResult = z.infer<typeof InfraPlanResultSchema>;

/**
 * Crawler Hints (ADR 0027): ligado pela rota interna de flags da zona depois do `tofu apply`.
 * A rota não é documentada, então a falha não derruba o apply: vira `falhou`, e a pessoa
 * operadora liga no painel.
 */
export const CRAWLER_HINTS_STATES = ['ligado', 'falhou'] as const;

/** Resultado do `apply`: as saídas da raiz `infra/site`. */
export const InfraApplyResultSchema = z.discriminatedUnion('status', [
  z.object({
    ...InfraBase,
    status: z.literal('ok'),
    /** Nameservers da zona, para configurar no registrador. */
    nameServers: z.array(z.string().min(1)).min(1),
    zoneId: z.string().min(1),
    crawlerHints: z.enum(CRAWLER_HINTS_STATES),
  }),
  InfraFailed,
]);
export type InfraApplyResult = z.infer<typeof InfraApplyResultSchema>;
