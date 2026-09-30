// Variáveis do blog (ADR 0007 da unidade), validadas no início do build e do SSR. Decidem
// de onde vem o conteúdo e qual site construir — nunca tema ou layout, que vêm da
// configuração do site. CONTENT_SOURCE é sempre explícito: a falta dele nunca faz um build
// de produção cair na fixture.
import { z } from 'zod';

const Slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use o ID do site (kebab-case)');
const ApiFields = {
  CONTENT_SOURCE: z.literal('api'),
  EXPORT_API_URL: z.url(),
  EXPORT_BUILD_TOKEN: z.string().min(32, 'O token interno tem pelo menos 32 caracteres'),
};
const FixtureFields = { CONTENT_SOURCE: z.literal('fixture') };

/** Onde o conteúdo é lido: a API de exportação ou as fixtures do content-model. */
export const SourceEnvSchema = z.discriminatedUnion('CONTENT_SOURCE', [
  z.object(ApiFields),
  z.object(FixtureFields),
]);

export const BuildEnvSchema = z.intersection(
  SourceEnvSchema,
  z.object({
    SITE_ID: Slug,
    /** Caminho absoluto; o render do site-builder lê para o result.json. */
    SNAPSHOT_META_FILE: z
      .string()
      .refine((path) => path.startsWith('/'), 'Use um caminho absoluto')
      .optional(),
  }),
);

export type SourceEnv = z.infer<typeof SourceEnvSchema>;
export type BuildEnv = z.infer<typeof BuildEnvSchema>;

function parse<S extends z.ZodType>(schema: S, env: NodeJS.ProcessEnv, what: string): z.output<S> {
  const parsed = schema.safeParse(env);
  if (parsed.success) return parsed.data;
  const problems = parsed.error.issues
    .map((issue) => `${issue.path.join('.') || 'CONTENT_SOURCE'}: ${issue.message}`)
    .join('; ');
  // Nunca inclui valores: o token do build passaria para o log.
  throw new Error(`Variáveis de ${what} inválidas — ${problems}`);
}

export function buildEnv(env: NodeJS.ProcessEnv = process.env): BuildEnv {
  return parse(BuildEnvSchema, env, 'build');
}

export function sourceEnv(env: NodeJS.ProcessEnv = process.env): SourceEnv {
  return parse(SourceEnvSchema, env, 'visualização');
}
