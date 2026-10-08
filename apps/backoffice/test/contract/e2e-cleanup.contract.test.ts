import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import { SITE_TABLES } from '../e2e/cleanup.ts';
import { setupDatabase } from './helpers.ts';

// Limpeza dos sites do E2E (#145): a lista de tabelas apagadas antes de `sites` tem de cobrir
// toda chave estrangeira para `sites`. Uma tabela nova fora dela faz o `delete from sites`
// falhar no `afterAll` e desfaz a limpeza inteira, deixando os sites da rodada no banco.

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await setupDatabase());
});
afterAll(() => close());

describe('limpeza dos sites do E2E', () => {
  it('apaga toda tabela com chave estrangeira para sites, e só elas', async () => {
    const { rows } = await db.execute<{ table: string }>(sql`
      select distinct conrelid::regclass::text as table
      from pg_constraint
      where contype = 'f' and confrelid = 'sites'::regclass
    `);
    const referencing = rows.map((row) => row.table).sort();

    expect(referencing.length).toBeGreaterThan(0);
    expect([...SITE_TABLES].sort()).toEqual(referencing);
  });
});
