// Variáveis do edge-local (ADR 0002 da unidade).
import { z } from 'zod';

export const EnvSchema = z.object({
  EDGE_LOCAL_DATA: z.string().startsWith('/').default('/data'),
  EDGE_LOCAL_SITE_PORT: z.coerce.number().int().positive().default(8080),
  EDGE_LOCAL_ADMIN_PORT: z.coerce.number().int().positive().default(8081),
  /** Versões guardadas por site; a ativa nunca é apagada. */
  EDGE_LOCAL_KEEP: z.coerce.number().int().min(1).default(10),
  /** Com a URL, o ae-sim grava no ClickHouse; sem ela, em NDJSON no volume. */
  EDGE_LOCAL_CLICKHOUSE_URL: z.url().optional(),
  EDGE_LOCAL_CLICKHOUSE_USER: z.string().default('default'),
  EDGE_LOCAL_CLICKHOUSE_PASSWORD: z.string().default(''),
  EDGE_LOCAL_CLICKHOUSE_DATABASE: z.string().default('analytics'),
});
export type Env = z.infer<typeof EnvSchema>;

export function readEnv(env: NodeJS.ProcessEnv = process.env): Env {
  return EnvSchema.parse(env);
}
