import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import { editorialContexts, pendingChanges } from '../../src/db/schema/index.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { SYSTEM_ACTOR, type Actor } from '../../src/domain/access/rbac.ts';
import {
  createEditorialContext,
  currentEditorialContext,
  listEditorialContexts,
} from '../../src/domain/generation/editorial-contexts.ts';
import { createSite } from '../../src/domain/sites/sites.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

let db: Db;
let close: () => Promise<void>;

const editor: Actor = { email: 'editor@exemplo.com', roles: ['editor'] };

beforeAll(async () => {
  ({ db, close } = await setupDatabase());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDatabase(db);
  for (const siteId of ['exemplo-a', 'exemplo-b']) {
    const line = (await readFixture(siteId)).find((l) => l.type === 'config');
    if (line?.type !== 'config') throw new Error('fixture sem config');
    await db.transaction((tx) => createSite(tx, SYSTEM_ACTOR, line.data));
  }
  await db.delete(pendingChanges);
});

const create = (siteId: string, body: string, actor: Actor = editor) =>
  db.transaction((tx) => createEditorialContext(tx, actor, siteId, body));

describe('contextos editoriais', () => {
  it('a primeira versão é 1 e cada gravação cria a N+1 sem alterar as anteriores', async () => {
    expect(await create('exemplo-a', 'Tom leve.')).toEqual({ ok: true, value: { version: 1 } });
    expect(await create('exemplo-a', '  Tom sério.  ')).toEqual({
      ok: true,
      value: { version: 2 },
    });

    const listed = await listEditorialContexts(db, SYSTEM_ACTOR, 'exemplo-a');
    if (!listed.ok) throw new Error(JSON.stringify(listed.issues));
    expect(
      listed.value.map(({ version, body, createdBy }) => ({ version, body, createdBy })),
    ).toEqual([
      { version: 2, body: 'Tom sério.', createdBy: 'editor@exemplo.com' },
      { version: 1, body: 'Tom leve.', createdBy: 'editor@exemplo.com' },
    ]);
    expect(listed.value.every(({ createdAt }) => createdAt instanceof Date)).toBe(true);
    expect((await currentEditorialContext(db, 'exemplo-a'))?.version).toBe(2);
  });

  it('numera as versões de cada site de forma independente', async () => {
    await create('exemplo-a', 'A1');
    await create('exemplo-a', 'A2');
    expect(await create('exemplo-b', 'B1')).toEqual({ ok: true, value: { version: 1 } });
    expect(await currentEditorialContext(db, 'exemplo-b')).toMatchObject({
      version: 1,
      body: 'B1',
    });
  });

  it('não registra mudança pendente', async () => {
    await create('exemplo-a', 'Tom leve.');
    const [row] = await db.select({ total: count() }).from(pendingChanges);
    expect(row?.total).toBe(0);
  });

  it('recusa site inexistente e ator sem content.write, sem gravar', async () => {
    expect(await create('nao-existe', 'Tom')).toMatchObject({
      ok: false,
      issues: [{ code: 'site.not_found' }],
    });
    const revisor: Actor = { email: 'revisor@exemplo.com', roles: ['revisor'] };
    expect(await create('exemplo-a', 'Tom', revisor)).toMatchObject({
      ok: false,
      issues: [{ code: 'forbidden' }],
    });
    const [row] = await db
      .select({ total: count() })
      .from(editorialContexts)
      .where(eq(editorialContexts.siteId, 'exemplo-a'));
    expect(row?.total).toBe(0);
  });

  it('sem versões, o atual é undefined e a lista é vazia', async () => {
    expect(await currentEditorialContext(db, 'exemplo-a')).toBeUndefined();
    expect(await listEditorialContexts(db, editor, 'exemplo-a')).toEqual({ ok: true, value: [] });
  });
});
