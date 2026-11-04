// Consulta SQL ao Analytics Engine (#545; ADR 0014 da raiz): o agregador da audiência escreve
// a SQL no dialeto do AE, e o adaptador só troca o transporte. Implementado sobre a interface
// HTTP do ClickHouse no local (src/lib/clickhouse.ts) e em memória nos testes.

export interface AeSqlClient {
  /**
   * Roda a consulta e devolve as linhas; inteiros de 64 bits chegam como `number`. Falha de
   * rede ou SQL recusada lança `AeSqlError`.
   */
  query<Row extends Record<string, unknown>>(sql: string): Promise<Row[]>;
}

/** Erro da consulta (rede, servidor ou SQL): a mensagem é a do servidor, nunca a URL. */
export class AeSqlError extends Error {
  override readonly name = 'AeSqlError';
}

/** Cliente em memória: cada consulta vai para `queries` e devolve o que `answer` mandar. */
export function memoryAeSqlClient(
  answer: (sql: string) => Record<string, unknown>[] = () => [],
): AeSqlClient & { queries: string[] } {
  const queries: string[] = [];
  return {
    queries,
    query<Row extends Record<string, unknown>>(sql: string) {
      queries.push(sql);
      return Promise.resolve(answer(sql) as Row[]);
    },
  };
}
