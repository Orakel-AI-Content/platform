import * as z from 'zod';

// Única leitura de process.env da unidade (convenção da raiz). Falha no boot com a lista
// do que falta. Lido sob demanda, para o `next build` não exigir as variáveis.

const token = z.string().min(32, 'Use um token com pelo menos 32 caracteres');

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.url(),
  ACCESS_TEAM_DOMAIN: z.string().min(1),
  ACCESS_JWKS_URL: z.url(),
  ACCESS_AUD: z.string().min(1),
  EXPORT_BUILD_TOKEN: token,
  EXPORT_PREVIEW_TOKEN: token,
  GENERATOR_TOKEN: token,
  S3_ENDPOINT: z.url(),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  /** Visualização SSR dos sites (apps/blog): a tela de revisão a abre em iframe, /<site>/<caminho>. */
  PREVIEW_BASE_URL: z.url(),
  /** Janela de agrupamento dos builds: 900 em produção, 30 no local. */
  BUILD_WINDOW_SECONDS: z.coerce.number().int().min(0).default(900),
  /** Limite diário de publicações por site (dia de America/Sao_Paulo); o site pode ter o próprio. */
  PUBLISH_DAILY_LIMIT: z.coerce.number().int().min(0).default(3),
  SENTRY_DSN: z.union([z.url(), z.literal('')]).optional(),
  HEARTBEAT_BASE_URL: z.union([z.url(), z.literal('')]).optional(),
  /** Só no E2E local: liga a página /teste-de-erro, que lança erro de propósito (#77). */
  E2E_ERROR_ROUTE: z.stringbool().default(false),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const parsed = EnvSchema.safeParse(source);
  if (parsed.success) return parsed.data;
  const lines = parsed.error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Variáveis de ambiente inválidas ou ausentes:\n${lines.join('\n')}`);
}

/**
 * Só o build-runner (12.0, L3): como criar os containers do site-builder e o que entregar a
 * cada um. O token de deploy da Cloudflare só existe aqui e só vai para o container publish.
 */
/** Vazio conta como ausente: o compose repassa variável não definida como ''. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

export const BuildRunnerEnvSchema = z
  .object({
    /** API do Docker, sempre pelo docker-socket-proxy (ADR 0011 da raiz). */
    DOCKER_HOST: z.string().regex(/^(tcp|http):\/\/[^/]+$/, 'Use tcp://host:porta'),
    /** Imagem sem tag; a tag é a release do site (ou SITE_BUILDER_TAG antes da primeira). */
    SITE_BUILDER_IMAGE: z.string().min(1),
    SITE_BUILDER_TAG: z.string().min(1).default('local'),
    BUILD_EXPORT_NETWORK: z.string().min(1).default('orakel-export'),
    BUILD_PUBLISH_NETWORK: z.string().min(1).default('orakel-publish'),
    /** API de exportação vista da rede export. */
    BUILD_EXPORT_API_URL: z.url().default('http://backoffice-web:3000'),
    BUILD_PAGE_DROP_TOLERANCE: z.coerce.number().min(0).max(1).default(0.2),
    DEPLOY_TARGET: z.enum(['local', 'cloudflare']).default('local'),
    EDGE_LOCAL_URL: optional(z.url()),
    CLOUDFLARE_API_TOKEN: optional(z.string().min(32)),
    CLOUDFLARE_ACCOUNT_ID: optional(z.string().regex(/^[0-9a-f]{32}$/)),
  })
  .refine((env) => env.DEPLOY_TARGET !== 'local' || env.EDGE_LOCAL_URL !== undefined, {
    message: 'Defina EDGE_LOCAL_URL com DEPLOY_TARGET=local',
    path: ['EDGE_LOCAL_URL'],
  })
  .refine(
    (env) =>
      env.DEPLOY_TARGET !== 'cloudflare' ||
      (env.CLOUDFLARE_API_TOKEN !== undefined && env.CLOUDFLARE_ACCOUNT_ID !== undefined),
    {
      message: 'Defina CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID com DEPLOY_TARGET=cloudflare',
      path: ['DEPLOY_TARGET'],
    },
  );

export type BuildRunnerEnv = z.infer<typeof BuildRunnerEnvSchema>;

export function parseBuildRunnerEnv(source: Record<string, string | undefined>): BuildRunnerEnv {
  const parsed = BuildRunnerEnvSchema.safeParse(source);
  if (parsed.success) return parsed.data;
  const lines = parsed.error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Variáveis do build-runner inválidas ou ausentes:\n${lines.join('\n')}`);
}

/** Ambiente do build-runner; só esse processo o lê. */
export function getBuildRunnerEnv(): BuildRunnerEnv {
  return parseBuildRunnerEnv(process.env);
}

/**
 * Só o banco (#145): para quem abre o Postgres e não precisa do ambiente do app inteiro, como
 * a limpeza do E2E. Uma variável do app ausente (ex.: `PREVIEW_BASE_URL` num `.env.local`
 * antigo) não impede de chegar ao banco.
 */
export const DatabaseEnvSchema = EnvSchema.pick({ DATABASE_URL: true });

export function parseDatabaseEnv(source: Record<string, string | undefined>): string {
  const parsed = DatabaseEnvSchema.safeParse(source);
  if (parsed.success) return parsed.data.DATABASE_URL;
  const lines = parsed.error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Variáveis de ambiente inválidas ou ausentes:\n${lines.join('\n')}`);
}

/** URL do Postgres, sem validar o resto do ambiente do app. */
export function getDatabaseUrl(): string {
  return parseDatabaseEnv(process.env);
}

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
