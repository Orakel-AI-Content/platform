import * as z from 'zod';

import { INFRA_RESOURCE_STEPS } from './db/schema/index.ts';
import { PricingTableSchema } from './domain/generation/pricing.ts';

// Única leitura de process.env da unidade (convenção da raiz). Falha no boot com a lista
// do que falta. Lido sob demanda, para o `next build` não exigir as variáveis.

const token = z.string().min(32, 'Use um token com pelo menos 32 caracteres');

/** Vazio conta como ausente: o compose repassa variável não definida como ''. */
const blankAsUndefined = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema);
const optional = <T extends z.ZodType>(schema: T) => blankAsUndefined(schema.optional());

/** Modelo da geração: `fixture` (sem rede, para os testes) ou `anthropic:<modelo>`. */
export const DEFAULT_LLM_MODEL = 'anthropic:claude-haiku-5-5';
const llmModel = z
  .string()
  .regex(/^(fixture|anthropic:[a-z0-9][a-z0-9.-]*)$/, 'Use fixture ou anthropic:<modelo>');

/** Tabela de preços em JSON (`{"anthropic:claude-haiku-5-5":{"input":0.1,"output":0.5}}`). */
const llmPricing = z
  .string()
  .transform((value, ctx) => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Use um JSON válido' });
      return z.NEVER;
    }
  })
  .pipe(PricingTableSchema);

const EnvObjectSchema = z.object({
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
  PUBLISH_DAILY_LIMIT: z.coerce.number().int().min(0).default(10),
  SENTRY_DSN: z.union([z.url(), z.literal('')]).optional(),
  HEARTBEAT_BASE_URL: z.union([z.url(), z.literal('')]).optional(),
  /** Só no E2E local: liga a página /teste-de-erro, que lança erro de propósito (#77). */
  E2E_ERROR_ROUTE: z.stringbool().default(false),
  /** Geração básica (workspace#23): modelo, chave do provedor (só no .env.local) e preços. */
  LLM_MODEL: blankAsUndefined(llmModel.default(DEFAULT_LLM_MODEL)),
  LLM_API_KEY: optional(z.string().min(1)),
  LLM_PRICING: blankAsUndefined(llmPricing.default({})),
  /**
   * Backoffice-web visto pelo backoffice-worker: a task generate-article cria o artigo pela
   * rota interna, com o GENERATOR_TOKEN (contrato motor → Backoffice), na rede `internal`.
   */
  GENERATOR_API_URL: blankAsUndefined(z.url().default('http://backoffice-web:3000')),
});

export const EnvSchema = EnvObjectSchema.refine(
  (env) => env.LLM_MODEL === 'fixture' || env.LLM_API_KEY !== undefined,
  { message: 'Defina LLM_API_KEY, ou LLM_MODEL=fixture para gerar sem LLM', path: ['LLM_API_KEY'] },
);

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const parsed = EnvSchema.safeParse(source);
  if (parsed.success) return parsed.data;
  const lines = parsed.error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Variáveis de ambiente inválidas ou ausentes:\n${lines.join('\n')}`);
}

/**
 * Segredos da infra do site (ADR 0027 da raiz): só o build-runner os conhece e só o container do
 * infra-runner os recebe. Obrigatórios com INFRA_DRIVER=tofu; um `refine` por segredo, para o
 * erro dizer qual falta (nunca o valor).
 */
const INFRA_SECRETS = [
  'CLOUDFLARE_INFRA_TOKEN',
  'TOFU_STATE_ACCESS_KEY_ID',
  'TOFU_STATE_SECRET_ACCESS_KEY',
  'TOFU_STATE_PASSPHRASE',
] as const;

/**
 * Tudo que o driver `tofu` exige: os segredos e a entrada do container que não é segredo (a tag
 * da imagem, a caixa central do Email Routing e a conta, que também monta o endpoint do
 * `tofu-state`).
 */
const INFRA_TOFU_REQUIRED = [
  'INFRA_RUNNER_TAG',
  'INFRA_EMAIL_FORWARD_TO',
  'CLOUDFLARE_ACCOUNT_ID',
  ...INFRA_SECRETS,
] as const;

/**
 * Só o build-runner (12.0, L3): como criar os containers do site-builder e do infra-runner e o
 * que entregar a cada um. O token de deploy da Cloudflare só existe aqui e só vai para o
 * container publish; os segredos de infra, só para o container de infra.
 */
export const BuildRunnerEnvSchema = z
  .object({
    /** API do Docker, sempre pelo docker-socket-proxy (ADR 0011 da raiz). */
    DOCKER_HOST: z.string().regex(/^(tcp|http):\/\/[^/]+$/, 'Use tcp://host:porta'),
    /** Imagem sem tag; a tag é a release do site. */
    SITE_BUILDER_IMAGE: z.string().min(1),
    /** Imagem do plano e do apply da infra do site, sem tag (ADR 0027 da raiz). */
    INFRA_RUNNER_IMAGE: z.string().min(1),
    /**
     * Tag do infra-runner: o SHA do commit, o mesmo do backoffice (o grupo `images` constrói as
     * duas). Obrigatória com INFRA_DRIVER=tofu; o driver local não inicia container.
     */
    INFRA_RUNNER_TAG: optional(z.string().min(1)),
    /**
     * Tag usada pelo site ainda sem release (só no local e no E2E). Sem ela, site sem versão é
     * recusado no build; obrigatória com RELEASE_DRIVER=local, que etiqueta essa imagem.
     */
    SITE_BUILDER_TAG: optional(z.string().min(1)),
    BUILD_EXPORT_NETWORK: z.string().min(1).default('orakel-export'),
    BUILD_PUBLISH_NETWORK: z.string().min(1).default('orakel-publish'),
    /** Rede do Caddy: a prévia entra nela e na export com o apelido `blog-preview` (ADR 0024). */
    BUILD_INTERNAL_NETWORK: z.string().min(1).default('orakel-internal'),
    /** API de exportação vista da rede export. */
    BUILD_EXPORT_API_URL: z.url().default('http://backoffice-web:3000'),
    BUILD_PAGE_DROP_TOLERANCE: z.coerce.number().min(0).max(1).default(0.2),
    DEPLOY_TARGET: z.enum(['local', 'cloudflare']).default('local'),
    EDGE_LOCAL_URL: optional(z.url()),
    CLOUDFLARE_API_TOKEN: optional(z.string().min(32)),
    CLOUDFLARE_ACCOUNT_ID: optional(z.string().regex(/^[0-9a-f]{32}$/)),
    /**
     * Como "Gerar nova versão" produz a imagem (ADR 0023 da raiz): `github` dispara o release.yml
     * e baixa a imagem do GHCR; `local` dá o CI como concluído e etiqueta a imagem
     * `SITE_BUILDER_IMAGE:SITE_BUILDER_TAG` do host (compose local, sem serviço externo).
     */
    RELEASE_DRIVER: blankAsUndefined(z.enum(['github', 'local']).default('github')),
    /**
     * PAT fine-grained do GitHub (ADR 0022 da raiz): `actions:write` e `contents:read` só no
     * repositório do release.yml. Dispara e acompanha o run da release; obrigatório com
     * RELEASE_DRIVER=github.
     */
    GITHUB_RELEASE_TOKEN: optional(
      z.string().regex(/^github_pat_[A-Za-z0-9_]+$/, 'Use um PAT fine-grained (github_pat_…)'),
    ),
    /** Repositório do release.yml (`dono/nome`). */
    GITHUB_RELEASE_REPOSITORY: blankAsUndefined(
      z
        .string()
        .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, 'Use dono/nome')
        .default('Orakel-AI-Content/platform'),
    ),
    /**
     * Como "Criar infraestrutura" aplica a infra do site (ADR 0027 da raiz): `tofu` roda o plano e
     * o apply no container do infra-runner; `local` simula as etapas, sem rede nem segredos
     * (compose local e E2E).
     */
    INFRA_DRIVER: blankAsUndefined(z.enum(['tofu', 'local']).default('tofu')),
    /**
     * Caixa central do Email Routing (ADR 0027, passo manual 4): única da conta, já verificada.
     * Não é segredo; vai só para o container de infra, como EMAIL_FORWARD_TO.
     */
    INFRA_EMAIL_FORWARD_TO: optional(z.email()),
    /**
     * Só com INFRA_DRIVER=local (E2E): a primeira execução de cada site falha nesta etapa, para
     * exercitar "Tentar de novo". Vazio não força falha.
     */
    INFRA_LOCAL_FAIL_STEP: optional(z.enum(INFRA_RESOURCE_STEPS)),
    /** Token de infra da Cloudflare, restrito ao IP da VPS; nem o de deploy nem o de leitura. */
    CLOUDFLARE_INFRA_TOKEN: optional(z.string().min(32)),
    /** Credenciais S3 (R2) do bucket `tofu-state`, onde fica o estado de cada site. */
    TOFU_STATE_ACCESS_KEY_ID: optional(z.string().min(1)),
    TOFU_STATE_SECRET_ACCESS_KEY: optional(z.string().min(1)),
    /** Senha da cifragem do estado e do plano (`pbkdf2` do OpenTofu: 16 caracteres ou mais). */
    TOFU_STATE_PASSPHRASE: optional(z.string().min(16, 'Use pelo menos 16 caracteres')),
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
  )
  .refine((env) => env.RELEASE_DRIVER !== 'github' || env.GITHUB_RELEASE_TOKEN !== undefined, {
    message: 'Defina GITHUB_RELEASE_TOKEN, ou RELEASE_DRIVER=local para gerar versão sem o GitHub',
    path: ['GITHUB_RELEASE_TOKEN'],
  })
  .refine((env) => env.RELEASE_DRIVER !== 'local' || env.SITE_BUILDER_TAG !== undefined, {
    message: 'Defina SITE_BUILDER_TAG com RELEASE_DRIVER=local (a imagem que vira a versão)',
    path: ['SITE_BUILDER_TAG'],
  })
  .superRefine((env, ctx) => {
    if (env.INFRA_DRIVER !== 'tofu') return;
    if (env.INFRA_LOCAL_FAIL_STEP !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'INFRA_LOCAL_FAIL_STEP só vale com INFRA_DRIVER=local',
        path: ['INFRA_LOCAL_FAIL_STEP'],
      });
    }
    for (const name of INFRA_TOFU_REQUIRED) {
      if (env[name] !== undefined) continue;
      ctx.addIssue({
        code: 'custom',
        message: `Defina ${name}, ou INFRA_DRIVER=local para simular a infra sem a Cloudflare`,
        path: [name],
      });
    }
  });

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
export const DatabaseEnvSchema = EnvObjectSchema.pick({ DATABASE_URL: true });

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

/**
 * Só quem consulta o Analytics Engine por SQL (agregador da audiência, #545): fora do
 * `EnvSchema` para o web e o worker subirem sem elas. `AE_SQL_URL` leva usuário e senha no
 * userinfo (`http://orakel:senha@localhost:8123`). O transporte `cloudflare` (SQL API do AE)
 * entra no enum junto com o adaptador dele.
 */
export const AudienceEnvSchema = z.object({
  AE_SQL_TRANSPORT: z.enum(['clickhouse']),
  AE_SQL_URL: z.url(),
});

export type AudienceEnv = z.infer<typeof AudienceEnvSchema>;

export function parseAudienceEnv(source: Record<string, string | undefined>): AudienceEnv {
  const parsed = AudienceEnvSchema.safeParse(source);
  if (parsed.success) return parsed.data;
  // Só o caminho: a mensagem do Zod não repete o valor, mas a URL tem a senha.
  const lines = parsed.error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Variáveis do Analytics Engine inválidas ou ausentes:\n${lines.join('\n')}`);
}

/** Ambiente do cliente SQL do Analytics Engine, lido sob demanda. */
export function getAudienceEnv(): AudienceEnv {
  return parseAudienceEnv(process.env);
}

/**
 * Como `parseAudienceEnv`, mas sem nenhuma `AE_SQL_*` devolve `undefined`: o worker sobe e a
 * consolidação só avisa (#547). Só uma delas definida é configuração errada e lança.
 */
export function findAudienceEnv(
  source: Record<string, string | undefined> = process.env,
): AudienceEnv | undefined {
  if (!source.AE_SQL_TRANSPORT && !source.AE_SQL_URL) return undefined;
  return parseAudienceEnv(source);
}

/**
 * Só o backoffice-worker (workspace#85): conferir a zona do site (ADR 0025 da raiz). Fora do
 * `EnvSchema` para o web nunca receber o token. `cloudflare` lê a zona com um token só de
 * leitura (`CLOUDFLARE_ZONE_READ_TOKEN`), nunca com o de deploy; `local` pergunta ao edge-local.
 */
export const ZoneCheckEnvSchema = z
  .object({
    DEPLOY_TARGET: z.enum(['local', 'cloudflare']).default('local'),
    EDGE_LOCAL_URL: optional(z.url()),
    CLOUDFLARE_ZONE_READ_TOKEN: optional(z.string().min(32)),
    CLOUDFLARE_ACCOUNT_ID: optional(z.string().regex(/^[0-9a-f]{32}$/)),
  })
  .refine((env) => env.DEPLOY_TARGET !== 'local' || env.EDGE_LOCAL_URL !== undefined, {
    message: 'Defina EDGE_LOCAL_URL com DEPLOY_TARGET=local',
    path: ['EDGE_LOCAL_URL'],
  })
  .refine(
    (env) =>
      env.DEPLOY_TARGET !== 'cloudflare' ||
      (env.CLOUDFLARE_ZONE_READ_TOKEN !== undefined && env.CLOUDFLARE_ACCOUNT_ID !== undefined),
    {
      message:
        'Defina CLOUDFLARE_ZONE_READ_TOKEN e CLOUDFLARE_ACCOUNT_ID com DEPLOY_TARGET=cloudflare',
      path: ['DEPLOY_TARGET'],
    },
  );

export type ZoneCheckEnv = z.infer<typeof ZoneCheckEnvSchema>;

export function parseZoneCheckEnv(source: Record<string, string | undefined>): ZoneCheckEnv {
  const parsed = ZoneCheckEnvSchema.safeParse(source);
  if (parsed.success) return parsed.data;
  // Só o caminho e a mensagem do schema: nunca o valor (o token).
  const lines = parsed.error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Variáveis da conferência da zona inválidas ou ausentes:\n${lines.join('\n')}`);
}

/** Ambiente da conferência da zona, lido sob demanda (só o worker). */
export function getZoneCheckEnv(): ZoneCheckEnv {
  return parseZoneCheckEnv(process.env);
}

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
