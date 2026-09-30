import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { runMigrations } from 'graphile-worker';

import { createDb, createPool, type Db } from '../../src/db/client.ts';

// Banco dos testes de contrato: DATABASE_URL (no CI, o Postgres do job de contrato).
// Cada arquivo migra (idempotente) e limpa as tabelas antes de cada teste.

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../drizzle',
);

export async function setupDatabase(): Promise<{ db: Db; close: () => Promise<void> }> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Defina DATABASE_URL para os testes de contrato');
  const pool = createPool(url);
  const db = createDb(pool);
  await migrate(db, { migrationsFolder });
  await runMigrations({ pgPool: pool, logger: undefined });
  return { db, close: () => pool.end() };
}

const TABLES = [
  'pending_changes',
  'content_versions',
  'contents',
  'redirects',
  'media_variants',
  'media',
  'menus',
  'taxonomies',
  'authors',
  'site_sequences',
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
