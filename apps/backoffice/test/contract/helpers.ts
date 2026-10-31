import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { runMigrations } from 'graphile-worker';

import { createDb, createPool, type Db } from '../../src/db/client.ts';
import * as schema from '../../src/db/schema/index.ts';

// Banco dos testes de contrato: DATABASE_URL (no CI, o Postgres do job de contrato).
// Cada arquivo migra (idempotente) e limpa as tabelas antes de cada teste. Antes de migrar,
// a suíte recusa um banco com sites que ela não marcou (#116): apontada para o banco do
// local:up, ela apagaria o seed.

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../drizzle',
);

export async function setupDatabase(): Promise<{ db: Db; close: () => Promise<void> }> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Defina DATABASE_URL para os testes de contrato');
  const pool = createPool(url);
  const db = createDb(pool);
  try {
    await refuseForeignDatabase(db);
  } catch (error) {
    await pool.end();
    throw error;
  }
  await migrate(db, { migrationsFolder });
  await runMigrations({ pgPool: pool, logger: undefined });
  await db.execute(sql`create table if not exists contract_suite ()`);
  return { db, close: () => pool.end() };
}

/**
 * Marca da suíte no banco, fora das migrations: banco vazio ou já marcado segue; banco com
 * sites e sem a marca é de outra pessoa (o local:up, por exemplo) e não é tocado.
 */
async function refuseForeignDatabase(db: Db): Promise<void> {
  const { rows } = await db.execute<{ sites: string | null; marked: string | null }>(
    sql`select to_regclass('public.sites')::text as sites,
               to_regclass('public.contract_suite')::text as marked`,
  );
  const [state] = rows;
  if (state?.sites == null || state.marked != null) return;
  const { rows: found } = await db.execute(sql`select 1 from sites limit 1`);
  if (found.length === 0) return;
  throw new Error(
    'DATABASE_URL aponta para um banco com sites que a suíte de contrato não criou, e ela ' +
      'apagaria tudo. Use um Postgres descartável: receita "Postgres para o contrato, na ' +
      'máquina" em apps/backoffice/docs/conventions/testing.md.',
  );
}

const TABLES = [
  'builds',
  'pending_changes',
  'reviews',
  'publications',
  'content_versions',
  'contents',
  'redirects',
  'media_variants',
  'media',
  'menus',
  'taxonomies',
  'authors',
  'site_sequences',
  'site_policy_triggers',
  'site_configs',
  'sites',
  'user_roles',
  'users',
];

export async function resetDatabase(db: Db): Promise<void> {
  await db.execute(sql.raw(`truncate ${TABLES.join(', ')} restart identity cascade`));
  await db.execute(sql`delete from graphile_worker._private_jobs`);
  await db.execute(sql`delete from graphile_worker._private_job_queues`);
}

type PlanNode = { 'Node Type': string; 'Relation Name'?: string; Plans?: PlanNode[] };

function seqScans(node: PlanNode, found: Set<string>): Set<string> {
  if (node['Node Type'] === 'Seq Scan' && node['Relation Name']) found.add(node['Relation Name']);
  for (const child of node.Plans ?? []) seqScans(child, found);
  return found;
}

/**
 * Roda `read` num banco que registra as consultas e devolve o resultado, o tempo e as tabelas
 * que algum plano lê por `Seq Scan` (`EXPLAIN (FORMAT JSON)` de cada consulta, depois). Para os
 * casos de volume (#461): rode o `analyzeTables` antes, ou o plano é o de tabelas vazias.
 */
export async function profileQueries<T>(
  db: Db,
  read: (traced: Db) => Promise<T>,
): Promise<{ result: T; ms: number; seqScans: string[] }> {
  const queries: { query: string; params: unknown[] }[] = [];
  const traced = drizzle(db.$client, {
    schema,
    casing: 'snake_case',
    logger: { logQuery: (query, params) => queries.push({ query, params }) },
  });
  const start = performance.now();
  const result = await read(traced);
  const ms = performance.now() - start;
  const found = new Set<string>();
  for (const { query, params } of queries) {
    const { rows } = await db.$client.query<{ 'QUERY PLAN': { Plan: PlanNode }[] }>(
      `explain (format json) ${query}`,
      params,
    );
    const [plan] = rows[0]?.['QUERY PLAN'] ?? [];
    if (plan) seqScans(plan.Plan, found);
  }
  return { result, ms, seqScans: [...found].sort() };
}
