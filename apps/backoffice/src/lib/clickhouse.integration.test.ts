// Cliente SQL do Analytics Engine contra um ClickHouse de verdade (#545; ADR 0014 da raiz).
// Roda com BACKOFFICE_TEST_AE_SQL_URL (CI: serviço clickhouse do job quality; local: o do
// compose, `http://orakel:orakel-local@localhost:8123/?database=default`). Sem ela, é pulado.
import { describe, expect, it } from 'vitest';

import { AeSqlError } from '../domain/audience/sql.ts';
import { aeSqlClient } from './clickhouse.ts';

const url = process.env.BACKOFFICE_TEST_AE_SQL_URL;

// O corpo do describe roda na coleta mesmo pulado: o cliente só nasce dentro dos testes.
const client = () => aeSqlClient({ AE_SQL_TRANSPORT: 'clickhouse', AE_SQL_URL: url ?? '' });

describe.skipIf(!url)('cliente SQL do Analytics Engine × ClickHouse', () => {
  it('devolve linhas tipadas, com inteiros de 64 bits como número', async () => {
    const rows = await client().query<{ views: number; sessions: number; site: string }>(`
      SELECT toUInt64(9007199254740991) AS views, COUNT(DISTINCT number) AS sessions, 'a' AS site
      FROM numbers(3)`);
    expect(rows).toEqual([{ views: 9007199254740991, sessions: 3, site: 'a' }]);
  });

  it('SQL recusada vira AeSqlError com a mensagem do servidor, sem a URL', async () => {
    const error = await client()
      .query('SELEC 1')
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AeSqlError);
    const { message } = error as Error;
    expect(message).toMatch(/^ClickHouse 400: .*Syntax error/s);
    const { host, password } = new URL(url ?? '');
    expect(message).not.toContain(host);
    if (password) expect(message).not.toContain(password);
  });
});
