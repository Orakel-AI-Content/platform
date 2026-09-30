import { validateSnapshot, type SnapshotLine } from '@orakel/content-model/v1';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { readFixture } from '../../src/bin/seed.ts';
import type { Db } from '../../src/db/client.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
import { openSnapshot, snapshotLines } from '../../src/domain/export/snapshot.ts';
import { importSnapshot } from '../../src/domain/import/import-snapshot.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

// Contrato da API de exportação (ADR 0005 da raiz): o snapshot que o Backoffice produz
// passa no schema e na validação semântica do content-model e reproduz as fixtures.

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await setupDatabase());
});
afterAll(() => close());
beforeEach(() => resetDatabase(db));

async function readSnapshot(siteId: string): Promise<SnapshotLine[]> {
  const opened = await openSnapshot(db, siteId);
  if (!opened.ok) throw new Error(JSON.stringify(opened.issues));
  const text = await new Response(opened.value).text();
  return text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as SnapshotLine);
}

describe.each(['exemplo-a', 'exemplo-b'])('snapshot de %s', (site) => {
  it('passa no content-model e reproduz a fixture (menos as mudanças pendentes)', async () => {
    const fixture = await readFixture(site);
    const imported = await importSnapshot(db, SYSTEM_ACTOR, fixture);
    expect(imported).toEqual({ ok: true, value: { siteId: site } });

    const lines = await readSnapshot(site);
    expect(validateSnapshot(lines).ok).toBe(true);

    const [header, ...rest] = lines;
    expect(header).toMatchObject({ type: 'header', schemaVersion: 1, site });
    expect(header?.type === 'header' && header.pendingChangeIds.length).toBeGreaterThan(0);
    expect(rest).toEqual(fixture.slice(1));
  });
});

describe('API de exportação', () => {
  it('site inexistente é site.not_found, sem abrir transação', async () => {
    expect(await openSnapshot(db, 'nao-existe')).toMatchObject({
      ok: false,
      issues: [{ code: 'site.not_found' }],
    });
  });

  it('importar o mesmo site de novo é recusado e não grava nada', async () => {
    const fixture = await readFixture('exemplo-b');
    await importSnapshot(db, SYSTEM_ACTOR, fixture);
    const before = await readSnapshot('exemplo-b');
    expect(await importSnapshot(db, SYSTEM_ACTOR, fixture)).toMatchObject({
      ok: false,
      issues: [{ code: 'site.exists' }],
    });
    expect(await readSnapshot('exemplo-b')).toEqual(before);
  });

  it('snapshotLines conta cada entidade no end', async () => {
    await importSnapshot(db, SYSTEM_ACTOR, await readFixture('exemplo-a'));
    const lines: SnapshotLine[] = [];
    await db.transaction(
      async (tx) => {
        for await (const line of snapshotLines(tx, 'exemplo-a')) lines.push(line);
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
    expect(lines.at(-1)).toEqual({
      type: 'end',
      counts: { config: 1, author: 2, taxonomy: 3, menu: 1, media: 2, redirect: 1, content: 3 },
    });
  });
});
