import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
import { configureBuildWindow } from '../../src/domain/builds/schedule.ts';
import { setBuildWindow } from '../../src/domain/builds/site-state.ts';
import { createSite, listSites } from '../../src/domain/sites/sites.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

let db: Db;
let close: () => Promise<void>;

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
});

describe('registro de instâncias', () => {
  it('mostra a janela própria e a efetiva de cada site', async () => {
    configureBuildWindow(45_000);
    try {
      await db.transaction((tx) => setBuildWindow(tx, SYSTEM_ACTOR, 'exemplo-a', 30));
      const result = await listSites(db, SYSTEM_ACTOR);

      if (!result.ok) throw new Error(JSON.stringify(result.issues));
      expect(
        result.value.map(({ id, buildWindowSeconds, effectiveBuildWindowSeconds }) => ({
          id,
          buildWindowSeconds,
          effectiveBuildWindowSeconds,
        })),
      ).toEqual([
        { id: 'exemplo-a', buildWindowSeconds: 30, effectiveBuildWindowSeconds: 30 },
        { id: 'exemplo-b', buildWindowSeconds: null, effectiveBuildWindowSeconds: 45 },
      ]);
    } finally {
      configureBuildWindow(15 * 60_000);
    }
  });
});
