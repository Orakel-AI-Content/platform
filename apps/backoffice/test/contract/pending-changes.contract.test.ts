import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
import { createAuthor } from '../../src/domain/content/authors.ts';
import { createContent } from '../../src/domain/content/contents.ts';
import { createSite, unresolvedPendingChangeIds } from '../../src/domain/sites/sites.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

let db: Db;
let close: () => Promise<void>;
let config: Parameters<typeof createSite>[2];

beforeAll(async () => {
  ({ db, close } = await setupDatabase());
  const line = (await readFixture('exemplo-b')).find((l) => l.type === 'config');
  if (line?.type !== 'config') throw new Error('fixture sem config');
  config = line.data;
});
afterAll(() => close());
beforeEach(async () => {
  await resetDatabase(db);
  await db.transaction((tx) => createSite(tx, SYSTEM_ACTOR, config));
});

const author = { slug: 'ana', name: 'Ana' };

describe('recordPendingChange', () => {
  it('grava junto com a transação e some com o rollback', async () => {
    const before = await unresolvedPendingChangeIds(db, 'exemplo-b');
    await db
      .transaction(async (tx) => {
        await createAuthor(tx, SYSTEM_ACTOR, 'exemplo-b', author);
        throw new Error('desfaz');
      })
      .catch(() => undefined);
    expect(await unresolvedPendingChangeIds(db, 'exemplo-b')).toEqual(before);

    await db.transaction((tx) => createAuthor(tx, SYSTEM_ACTOR, 'exemplo-b', author));
    expect((await unresolvedPendingChangeIds(db, 'exemplo-b')).length).toBe(before.length + 1);
  });

  it('sem permissão, nada é gravado', async () => {
    const editor = { email: 'r@orakel.local', roles: ['revisor'] as const };
    const result = await db.transaction((tx) => createAuthor(tx, editor, 'exemplo-b', author));
    expect(result).toMatchObject({ ok: false, issues: [{ code: 'forbidden' }] });
  });

  it('REPEATABLE READ: mudança confirmada depois do snapshot fica de fora e continua pendente', async () => {
    let seenInside: number[] = [];
    await db.transaction(
      async (tx) => {
        await tx.execute(sql`select 1`); // fixa o snapshot da transação
        await db.transaction((other) => createAuthor(other, SYSTEM_ACTOR, 'exemplo-b', author));
        seenInside = await unresolvedPendingChangeIds(tx, 'exemplo-b');
      },
      { isolationLevel: 'repeatable read' },
    );
    const seenAfter = await unresolvedPendingChangeIds(db, 'exemplo-b');
    expect(seenAfter.length).toBe(seenInside.length + 1);
  });
});

describe('IDs por site', () => {
  it('são sequenciais, nunca reutilizados, e respeitam IDs importados', async () => {
    const first = await db.transaction((tx) =>
      createAuthor(tx, SYSTEM_ACTOR, 'exemplo-b', author, { id: 7 }),
    );
    const next = await db.transaction((tx) =>
      createAuthor(tx, SYSTEM_ACTOR, 'exemplo-b', { slug: 'bia', name: 'Bia' }),
    );
    expect(first).toEqual({ ok: true, value: { id: 7 } });
    expect(next).toEqual({ ok: true, value: { id: 8 } });
  });

  it('o próximo número de bloco fica acima do maior n usado', async () => {
    await db.transaction((tx) =>
      createContent(tx, SYSTEM_ACTOR, 'exemplo-b', {
        kind: 'page',
        slug: 'p',
        title: 'P',
        authorIds: [],
        taxonomyIds: [],
        publishedAt: '2026-09-29T12:00:00-03:00',
        blocks: [
          { n: 1, type: 'toc' },
          { n: 4, type: 'toc' },
        ],
      }),
    );
    const [row] = (
      await db.execute(sql`select next_block_n from contents where site_id = 'exemplo-b'`)
    ).rows;
    expect(row).toEqual({ next_block_n: 5 });
  });
});
