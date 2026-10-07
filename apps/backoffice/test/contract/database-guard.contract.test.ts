import { count, sql } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import { sites } from '../../src/db/schema/index.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
import { createSite } from '../../src/domain/sites/sites.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

// A suíte recusa um banco com sites que ela não marcou (#116): simula o banco do local:up
// tirando a marca e gravando um site, e restaura a marca no fim para os outros arquivos.

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await setupDatabase());
  await resetDatabase(db);
});
afterAll(async () => {
  await db.execute(sql`create table if not exists contract_suite ()`);
  await close();
});

async function siteCount(): Promise<number> {
  const [row] = await db.select({ total: count() }).from(sites);
  return row?.total ?? 0;
}

it('recusa, sem apagar nada, um banco com sites e sem a marca da suíte', async () => {
  const line = (await readFixture('exemplo-a')).find((l) => l.type === 'config');
  if (line?.type !== 'config') throw new Error('fixture sem config');
  await db.transaction((tx) => createSite(tx, SYSTEM_ACTOR, line.data));
  await db.execute(sql`drop table contract_suite`);

  await expect(setupDatabase()).rejects.toThrow(
    /Postgres para o contrato.*docs\/conventions\/testing\.md/s,
  );
  expect(await siteCount()).toBe(1);
});

it('segue num banco com sites e com a marca da suíte', async () => {
  await db.execute(sql`create table if not exists contract_suite ()`);
  const again = await setupDatabase();
  await again.close();
  expect(await siteCount()).toBe(1);
});
