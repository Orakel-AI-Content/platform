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
  SENTRY_DSN: z.union([z.url(), z.literal('')]).optional(),
  HEARTBEAT_BASE_URL: z.union([z.url(), z.literal('')]).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const parsed = EnvSchema.safeParse(source);
  if (parsed.success) return parsed.data;
  const lines = parsed.error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Variáveis de ambiente inválidas ou ausentes:\n${lines.join('\n')}`);
}

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
