import { sql } from 'drizzle-orm';

import { createDb, createPool } from '../../src/db/client.ts';
import { getEnv } from '../../src/env.ts';

// Limpeza dos sites que o E2E cadastra no banco local (e2e-<timestamp>): sem ela, cada
// rodada deixa sites pausados na lista. O produto não remove sites; aqui é direto no banco.

/** Tabelas com site_id, das dependentes para as de que dependem. */
const SITE_TABLES = [
  'builds',
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
  'site_policy_triggers',
  'site_configs',
];

/**
 * Remove os sites, tudo o que pertence a eles e o build agendado. Pool próprio: o do processo
 * pode já ter sido encerrado por outro spec (o da mídia encerra no afterAll).
 */
export async function removeSites(siteIds: readonly string[]): Promise<void> {
  if (siteIds.length === 0) return;
  const ids = [...siteIds];
  const pool = createPool(getEnv().DATABASE_URL);
  try {
    await createDb(pool).transaction(async (tx) => {
      for (const table of SITE_TABLES) {
        await tx.execute(sql`delete from ${sql.identifier(table)} where site_id in ${ids}`);
      }
      await tx.execute(sql`delete from sites where id in ${ids}`);
      for (const id of ids)
        await tx.execute(sql`select graphile_worker.remove_job(${`build:${id}`})`);
    });
  } finally {
    await pool.end();
  }
}
