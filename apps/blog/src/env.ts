// Variáveis do blog (ADR 0007 da unidade), validadas no início do build e do SSR. Decidem
// de onde vem o conteúdo e qual site construir — nunca tema ou layout, que vêm da
// configuração do site. CONTENT_SOURCE é sempre explícito: a falta dele nunca faz um build
// de produção cair na fixture.
import { z } from 'zod';

const Slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use o ID do site (kebab-case)');
const Token = z.string().min(32, 'O token interno tem pelo menos 32 caracteres');
const ApiFields = { CONTENT_SOURCE: z.literal('api'), EXPORT_API_URL: z.url() };
const FixtureFields = { CONTENT_SOURCE: z.literal('fixture') };

// Onde o conteúdo é lido: a API de exportação ou as fixtures do content-model. Cada
// consumidor tem o seu token: o build lê o snapshot do build, a visualização o dela.
const BuildSourceSchema = z.discriminatedUnion('CONTENT_SOURCE', [
  z.object({ ...ApiFields, EXPORT_BUILD_TOKEN: Token }),
  z.object(FixtureFields),
]);

export const BuildEnvSchema = z.intersection(
  BuildSourceSchema,
  z.object({
    SITE_ID: Slug,
    /** Caminho absoluto; o render do site-builder lê para o result.json. */
    SNAPSHOT_META_FILE: z
      .string()
      .refine((path) => path.startsWith('/'), 'Use um caminho absoluto')
      .optional(),
  }),
);

/** SSR da visualização: snapshot de visualização (rascunhos inclusive), sem o token do build. */
export const PreviewEnvSchema = z.discriminatedUnion('CONTENT_SOURCE', [
  z.object({ ...ApiFields, EXPORT_PREVIEW_TOKEN: Token }),
  z.object(FixtureFields),
]);

export type PreviewEnv = z.infer<typeof PreviewEnvSchema>;
export type BuildEnv = z.infer<typeof BuildEnvSchema>;

function parse<S extends z.ZodType>(schema: S, env: NodeJS.ProcessEnv, what: string): z.output<S> {
  const parsed = schema.safeParse(env);
  if (parsed.success) return parsed.data;
  const problems = parsed.error.issues
    .map((issue) => `${issue.path.join('.') || 'CONTENT_SOURCE'}: ${issue.message}`)
    .join('; ');
  // Nunca inclui valores: os tokens passariam para o log.
  throw new Error(`Variáveis de ${what} inválidas — ${problems}`);
}

export function buildEnv(env: NodeJS.ProcessEnv = process.env): BuildEnv {
  return parse(BuildEnvSchema, env, 'build');
}

export function previewEnv(env: NodeJS.ProcessEnv = process.env): PreviewEnv {
  return parse(PreviewEnvSchema, env, 'visualização');
}
