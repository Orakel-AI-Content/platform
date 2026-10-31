import type { Redirect } from '@orakel/content-model/v1';
import { redirectUsage } from '@orakel/core/v1';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import { redirects } from '../../src/db/schema/index.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
import { createSite, redirectUsageFor } from '../../src/domain/sites/sites.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

// Alerta de redirects em 75% (#487, workspace#20 R6): o uso lido do banco é o `redirectUsage`
// do core sobre os mesmos redirects, com o limiar de 1.500 estáticos ou 75 dinâmicos.

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

/** `staticCount` redirects de caminho fixo e `dynamicCount` com splat, IDs a partir de 1. */
function makeRedirects(staticCount: number, dynamicCount: number): Redirect[] {
  const list: Redirect[] = [];
  for (let i = 0; i < staticCount; i++) {
    list.push({
      id: list.length + 1,
      from: `/antigo-${i}`,
      to: '/',
      status: 301,
      origin: 'manual',
    });
  }
  for (let i = 0; i < dynamicCount; i++) {
    list.push({
      id: list.length + 1,
      from: `/secao-${i}/*`,
      to: '/',
      status: 301,
      origin: 'manual',
    });
  }
  return list;
}

async function seedRedirects(siteId: string, list: readonly Redirect[]): Promise<void> {
  for (let i = 0; i < list.length; i += 500) {
    await db.insert(redirects).values(list.slice(i, i + 500).map((r) => ({ siteId, ...r })));
  }
}

async function usage(siteId: string) {
  const result = await redirectUsageFor(db, SYSTEM_ACTOR, siteId);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
}

describe('uso de redirects do site', () => {
  it.each([
    { label: '1.500 estáticos', staticCount: 1500, dynamicCount: 0, alert: true },
    { label: '75 dinâmicos', staticCount: 0, dynamicCount: 75, alert: true },
    { label: '1.499 estáticos e 74 dinâmicos', staticCount: 1499, dynamicCount: 74, alert: false },
  ])('$label: alert $alert, igual ao core', async ({ staticCount, dynamicCount, alert }) => {
    const list = makeRedirects(staticCount, dynamicCount);
    await seedRedirects('exemplo-a', list);

    const value = await usage('exemplo-a');

    expect(value).toEqual(redirectUsage(list));
    expect(value).toMatchObject({ static: staticCount, dynamic: dynamicCount, alert });
  });

  it('conta só os redirects do próprio site', async () => {
    await seedRedirects('exemplo-a', makeRedirects(1500, 0));
    await seedRedirects('exemplo-b', makeRedirects(3, 2));

    expect(await usage('exemplo-b')).toEqual(redirectUsage(makeRedirects(3, 2)));
    expect((await usage('exemplo-b')).alert).toBe(false);
  });

  it('sem site.read, recusa', async () => {
    const result = await redirectUsageFor(db, { email: 'x@orakel.local', roles: [] }, 'exemplo-a');
    expect(result).toMatchObject({ ok: false, issues: [{ code: 'forbidden' }] });
  });
});
