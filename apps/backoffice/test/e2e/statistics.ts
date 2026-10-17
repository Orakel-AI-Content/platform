import { getTableName, sql, type Table } from 'drizzle-orm';

import type { createDb } from '../../src/db/client.ts';

/**
 * Atualiza as estatísticas do Postgres das tabelas que um teste acabou de carregar em massa.
 *
 * Os testes de desempenho com 2.000 linhas (#107, #182, #186) inserem e consultam em seguida,
 * antes de o autovacuum rodar o `ANALYZE` (cerca de um minuto depois). Sem estatísticas, o
 * planejador acha as tabelas quase vazias e escolhe um Nested Loop que, na busca da biblioteca
 * de mídia, compara cada mídia com todos os envios do site: 4 milhões de `ilike`, cerca de
 * 0,8 s por consulta, e o teste passava do limite de 2 s. Com as estatísticas, o mesmo plano é
 * um Hash Join de 1 ms. Num banco em uso as estatísticas já existem; aqui o teste as cria.
 */
export async function analyzeTables(
  db: Pick<ReturnType<typeof createDb>, 'execute'>,
  ...tables: Table[]
): Promise<void> {
  const names = tables.map((table) => `"${getTableName(table)}"`).join(', ');
  await db.execute(sql.raw(`analyze ${names}`));
}
