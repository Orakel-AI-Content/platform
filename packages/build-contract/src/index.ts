// Contrato do volume /build entre o render, o publish e o build-runner do backoffice
// (ADR 0002 do build-site). Pacote à parte, só com Zod, para quem lê o volume não levar as
// dependências do site-builder (astro, wrangler) para a própria imagem.
//
//   /build/site/                     artefato estático
//   /build/wrangler.cloudflare.jsonc alvo de produção
//   /build/wrangler.local.jsonc      alvo do edge-local
//   /build/result.json               escrito pelo render, sempre
//   /build/publish.json              escrito pelo publish
import { z } from 'zod';

export const CONTRACT_VERSION = 1;
export const BUILD_DIR = '/build';
export const PATHS = {
  site: 'site',
  wranglerCloudflare: 'wrangler.cloudflare.jsonc',
  wranglerLocal: 'wrangler.local.jsonc',
  result: 'result.json',
  publish: 'publish.json',
} as const;

/** Código de saída de cada entrypoint; o `status`/`failure` do arquivo sempre concorda. */
export const EXIT_CODES = { ok: 0, permanent: 10, transient: 20 } as const;

export const FailureSchema = z.object({
  kind: z.enum(['permanent', 'transient']),
  message: z.string().min(1),
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

export function exitCodeOf(result: { status: 'ok' } | { status: 'failed'; failure: Failure }) {
  return result.status === 'ok' ? EXIT_CODES.ok : EXIT_CODES[result.failure.kind];
}
