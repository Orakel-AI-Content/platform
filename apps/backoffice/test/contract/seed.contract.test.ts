import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import { builds, sites } from '../../src/db/schema/index.ts';
import { queueFirstBuilds, readFixture } from '../../src/bin/seed.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
import { createSite } from '../../src/domain/sites/sites.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

let db: Db;
let close: () => Promise<void>;
let config: Parameters<typeof createSite>[2];

beforeAll(async () => {
  ({ db, close } = await setupDatabase());
  const line = (await readFixture('exemplo-a')).find((l) => l.type === 'config');
  if (line?.type !== 'config') throw new Error('fixture sem config');
  config = line.data;
});
afterAll(() => close());

// Três sites recém-criados; a fila que a criação agenda é esvaziada, para sobrar só o que o
// seed pede.
beforeEach(async () => {
  await resetDatabase(db);
  for (const id of ['sem-publicacao', 'publicado', 'pausado']) {
    await db.transaction((tx) => createSite(tx, SYSTEM_ACTOR, { ...config, siteId: id }));
  }
  await db.update(sites).set({ activeVersionId: 'v1' }).where(eq(sites.id, 'publicado'));
  await db
    .update(sites)
    .set({ state: 'pausado', pausedReason: 'x' })
    .where(eq(sites.id, 'pausado'));
  await db.execute(sql`delete from graphile_worker._private_jobs`);
  await db.delete(builds);
});

async function buildJobs(): Promise<{ key: string; run_at: Date | string }[]> {
  const { rows } = await db.execute<{ key: string; run_at: Date | string }>(
    sql`select key, run_at from graphile_worker.jobs where task_identifier = 'build' order by key`,
  );
  return rows;
}

describe('seed: primeiro build dos sites sem publicação', () => {
  it('enfileira só o site sem activeVersionId e não pausado, pedido pelo sistema', async () => {
    const before = Date.now();
    expect(await queueFirstBuilds(db, ['sem-publicacao', 'publicado', 'pausado'])).toEqual([
      'sem-publicacao',
    ]);
    const rows = await db
      .select({
        siteId: builds.siteId,
        kind: builds.kind,
        status: builds.status,
        requestedBy: builds.requestedBy,
      })
      .from(builds);
    expect(rows).toEqual([
      {
        siteId: 'sem-publicacao',
        kind: 'build',
        status: 'na_fila',
        requestedBy: SYSTEM_ACTOR.email,
      },
    ]);
    // "Publicar agora": o job roda já, sem esperar a janela.
    const jobs = await buildJobs();
    expect(jobs.map((job) => job.key)).toEqual(['build:sem-publicacao']);
    expect(new Date(jobs[0]!.run_at).getTime()).toBeLessThanOrEqual(Date.now());
    expect(new Date(jobs[0]!.run_at).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it('repetir não cria outra linha nem outro job', async () => {
    await queueFirstBuilds(db, ['sem-publicacao']);
    await queueFirstBuilds(db, ['sem-publicacao']);
    expect(await db.select({ id: builds.id }).from(builds)).toHaveLength(1);
    expect(await buildJobs()).toHaveLength(1);
  });

  it('site publicado depois não ganha pedido novo', async () => {
    await db.update(sites).set({ activeVersionId: 'v1' }).where(eq(sites.id, 'sem-publicacao'));
    expect(await queueFirstBuilds(db, ['sem-publicacao', 'publicado'])).toEqual([]);
    expect(await db.select().from(builds)).toEqual([]);
  });

  it('ignora site fora da lista e lista vazia', async () => {
    expect(await queueFirstBuilds(db, [])).toEqual([]);
    expect(await queueFirstBuilds(db, ['outro'])).toEqual([]);
    expect(await buildJobs()).toEqual([]);
  });
});
