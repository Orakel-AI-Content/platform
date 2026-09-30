import type { ExtractTablesWithRelations } from 'drizzle-orm';
import { drizzle, type NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import pg from 'pg';

import { getEnv } from '../env.ts';
import * as schema from './schema/index.ts';

export type Schema = typeof schema;

/** Banco ou transação: o domínio recebe um executor e não sabe qual dos dois é. */
export type Executor = PgDatabase<NodePgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

/**
 * Um pool por processo, compartilhado pelo Drizzle e pelo Graphile Worker: é o que permite
 * enfileirar um job na mesma transação da gravação.
 */
export function createPool(connectionString: string): pg.Pool {
  const pool = new pg.Pool({ connectionString, max: 10 });
  // Conexão ociosa que cai (reinício do Postgres) não derruba o processo: o pool reconecta.
  pool.on('error', (error) => {
    console.error(
      JSON.stringify({ level: 50, msg: 'Erro numa conexão ociosa do pool', error: String(error) }),
    );
  });
  return pool;
}

export function createDb(pool: pg.Pool) {
  return drizzle(pool, { schema, casing: 'snake_case' });
}

export type Db = ReturnType<typeof createDb>;

type Shared = { pool: pg.Pool; db: Db };
const globalForDb = globalThis as unknown as { orakelDb?: Shared };

/** Pool e banco do processo; sobrevive ao recarregamento do `next dev`. */
export function getDb(): Shared {
  globalForDb.orakelDb ??= (() => {
    const pool = createPool(getEnv().DATABASE_URL);
    return { pool, db: createDb(pool) };
  })();
  return globalForDb.orakelDb;
}
