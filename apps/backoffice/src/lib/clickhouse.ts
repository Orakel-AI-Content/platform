// Analytics Engine local pela interface HTTP do ClickHouse (#545; ADR 0014 da raiz): a SQL do
// AE roda sem tradução na tabela events; o adaptador só troca o transporte e o formato da
// resposta. Sem cliente pronto: é um POST. O padrão é o do ae-sim (edge-local, ae-sink.ts).
import { AeSqlError, type AeSqlClient } from '../domain/audience/sql.ts';
import type { AudienceEnv } from '../env.ts';

/** Banco da tabela events (infra/local/clickhouse/init.sql); `?database=` na URL troca. */
const DEFAULT_DATABASE = 'analytics';
const MAX_ERROR_LENGTH = 500;

type Options = {
  /** AE_SQL_URL: `http://usuário:senha@host:8123`, opcionalmente com `?database=`. */
  url: string;
  fetch?: typeof fetch;
};

export function clickhouseSqlClient(options: Options): AeSqlClient {
  const doFetch = options.fetch ?? fetch;
  // O fetch recusa URL com credenciais: usuário e senha vão nos cabeçalhos do ClickHouse.
  const endpoint = new URL(options.url);
  const headers: Record<string, string> = { 'content-type': 'text/plain; charset=utf-8' };
  if (endpoint.username) {
    headers['X-ClickHouse-User'] = decodeURIComponent(endpoint.username);
    headers['X-ClickHouse-Key'] = decodeURIComponent(endpoint.password);
  }
  endpoint.username = '';
  endpoint.password = '';
  if (!endpoint.searchParams.has('database')) {
    endpoint.searchParams.set('database', DEFAULT_DATABASE);
  }
  endpoint.searchParams.set('default_format', 'JSON');
  endpoint.searchParams.set('output_format_json_quote_64bit_integers', '0');

  return {
    async query<Row extends Record<string, unknown>>(sql: string): Promise<Row[]> {
      let response: Response;
      try {
        response = await doFetch(endpoint, { method: 'POST', headers, body: sql });
      } catch (error) {
        // Sem a URL na mensagem; o `cause` fica para o Sentry.
        throw new AeSqlError('ClickHouse indisponível', { cause: error });
      }
      const text = await response.text();
      if (!response.ok) {
        throw new AeSqlError(
          `ClickHouse ${response.status}: ${text.trim().slice(0, MAX_ERROR_LENGTH)}`,
        );
      }
      try {
        return (JSON.parse(text) as { data: Row[] }).data;
      } catch (error) {
        // Exceção no meio do streaming chega com 200 e corpo truncado.
        throw new AeSqlError(
          `Resposta do ClickHouse fora do formato JSON: ${text.trim().slice(-MAX_ERROR_LENGTH)}`,
          { cause: error },
        );
      }
    },
  };
}

/** Cliente pelo transporte configurado; o `cloudflare` entra com a SQL API do AE. */
export function aeSqlClient(env: AudienceEnv, fetchImpl?: typeof fetch): AeSqlClient {
  switch (env.AE_SQL_TRANSPORT) {
    case 'clickhouse':
      return clickhouseSqlClient({ url: env.AE_SQL_URL, fetch: fetchImpl });
  }
}
