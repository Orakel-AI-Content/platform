// Variáveis de cada entrypoint (ADR 0002–0005 da unidade), validadas com Zod. As mensagens
// de erro nunca incluem valores: os tokens passariam para o log.
import { z } from 'zod';

const Slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const Token = z.string().min(32, 'O token tem pelo menos 32 caracteres');
const OptionalInt = z.preprocess(
  (value) => (value === '' || value === undefined ? undefined : Number(value)),
  z.number().int().nonnegative().optional(),
);

export const RenderEnvSchema = z.object({
  SITE_ID: Slug,
  SITE_DOMAIN: z.string().regex(/^[a-z0-9.-]+$/, 'Use o domínio sem protocolo'),
  EXPORT_API_URL: z.url(),
  EXPORT_BUILD_TOKEN: Token,
  RELEASE: z.string().min(1).default('local'),
  ACTIVE_PAGE_COUNT: OptionalInt,
  PAGE_DROP_TOLERANCE: z.coerce.number().default(0.2),
  ALLOW_MASS_UNPUBLISH: z.enum(['true', 'false']).default('false'),
  BUILD_DIR: z.string().startsWith('/').default('/build'),
});
export type RenderEnv = z.infer<typeof RenderEnvSchema>;

const S3 = {
  S3_ENDPOINT: z.url(),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  BUILD_CACHE_BUCKET: z.string().min(1).default('build-cache'),
};
const PublishBase = {
  SITE_ID: Slug,
  BUILD_DIR: z.string().startsWith('/').default('/build'),
  ...S3,
};

export const PublishEnvSchema = z.discriminatedUnion('DEPLOY_TARGET', [
  z.object({
    ...PublishBase,
    DEPLOY_TARGET: z.literal('cloudflare'),
    CLOUDFLARE_API_TOKEN: Token,
    CLOUDFLARE_ACCOUNT_ID: z.string().regex(/^[0-9a-f]{32}$/),
  }),
  z.object({ ...PublishBase, DEPLOY_TARGET: z.literal('local'), EDGE_LOCAL_URL: z.url() }),
]);
export type PublishEnv = z.infer<typeof PublishEnvSchema>;

export class EnvError extends Error {
  override readonly name = 'EnvError';
  /** Configuração errada não se resolve tentando de novo. */
  readonly kind = 'permanent';
}

export function parseEnv<S extends z.ZodType>(schema: S, env: NodeJS.ProcessEnv, what: string) {
  const parsed = schema.safeParse(env);
  if (parsed.success) return parsed.data;
  const problems = parsed.error.issues
    .map((issue) => `${issue.path.join('.') || 'DEPLOY_TARGET'}: ${issue.message}`)
    .join('; ');
  throw new EnvError(`Variáveis do ${what} inválidas — ${problems}`);
}
