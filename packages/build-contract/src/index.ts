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

/** Resposta do `PUT /sites/{site}/versions` do edge-local (12.0, L3). */
export const EdgeLocalVersionSchema = z.object({ id: z.string().min(1) });

/** Resposta do `POST /sites/{site}/rollback` do edge-local: a versão que ficou ativa. */
export const EdgeLocalRollbackSchema = z.object({ active: z.string().min(1) });

export function exitCodeOf(result: { status: 'ok' } | { status: 'failed'; failure: Failure }) {
  return result.status === 'ok' ? EXIT_CODES.ok : EXIT_CODES[result.failure.kind];
}
