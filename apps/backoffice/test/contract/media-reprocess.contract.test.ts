import { RESOURCES, type Resources } from '@orakel/content-model/v1';
import { count, eq, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { readFixture } from '../../src/bin/seed.ts';
import type { Db } from '../../src/db/client.ts';
import { media, mediaVariants } from '../../src/db/schema/index.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
import { importSnapshot } from '../../src/domain/import/import-snapshot.ts';
import { reprocessSiteMedia, scheduleMediaReprocess } from '../../src/domain/media/reprocess.ts';
import { memoryStore, ORIGINALS_BUCKET } from '../../src/domain/media/store.ts';
import { registerMediaVariants } from '../../src/domain/media/variants.ts';
import { unresolvedPendingChangeIds } from '../../src/domain/sites/sites.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

// Reprocessamento das variantes (#51). Fixture do exemplo-a: mídia 1 com 2.560 px e mídia 2
// com 800 px, as duas sem original guardado (importadas).

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await setupDatabase());
});
afterAll(() => close());

const HASH = 'ef'.repeat(32);
const originalKey = `exemplo-a/${HASH}.jpg`;
/** Perfil com uma largura a mais (1600). */
const withExtraWidth: Resources = {
  ...RESOURCES,
  imageProfile: { ...RESOURCES.imageProfile, widths: [320, 640, 960, 1280, 1600, 1920] },
};

let store: ReturnType<typeof memoryStore>;
let mediaId: number;

beforeEach(async () => {
  await resetDatabase(db);
  for (const site of ['exemplo-a', 'exemplo-b']) {
    const imported = await importSnapshot(db, SYSTEM_ACTOR, await readFixture(site));
    if (!imported.ok) throw new Error(JSON.stringify(imported.issues));
  }
  store = memoryStore();
  const original = await sharp({
    create: { width: 2560, height: 1440, channels: 3, background: '#6a8caf' },
  })
    .jpeg()
    .toBuffer();
  await store.put(ORIGINALS_BUCKET, originalKey, original, original.byteLength, 'image/jpeg');
  const registered = await registerMediaVariants(
    { db, store },
    { siteId: 'exemplo-a', originalKey, width: 2560, height: 1440 },
  );
  if (registered.status !== 'registered') throw new Error('original não encontrado');
  mediaId = registered.id;
});

async function variantCount(): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(mediaVariants)
    .where(eq(mediaVariants.siteId, 'exemplo-a'));
  return row?.n ?? 0;
}

describe('reprocessamento das variantes', () => {
  it('a mídia registrada pelo job de variantes guarda a chave do original', async () => {
    const [row] = await db
      .select({ originalKey: media.originalKey })
      .from(media)
      .where(eq(media.id, mediaId));
    expect(row?.originalKey).toBe(originalKey);
  });

  it('largura nova no perfil: gera só ela, nos dois formatos, e registra a mudança', async () => {
    const before = { files: store.objects.size, rows: await variantCount() };
    const pending = await unresolvedPendingChangeIds(db, 'exemplo-a');
    const warnings: string[] = [];

    const report = await reprocessSiteMedia(
      { db, store, warn: (message) => warnings.push(message) },
      'exemplo-a',
      withExtraWidth,
    );

    expect(report).toEqual({ updated: [mediaId], withoutOriginal: [1], written: 2 });
    const added = [...store.objects.keys()].filter((key) => key.includes(`${HASH}-1600.`));
    expect(added.sort()).toEqual([
      `media-exemplo-a/exemplo-a/${HASH}-1600.avif`,
      `media-exemplo-a/exemplo-a/${HASH}-1600.webp`,
    ]);
    expect(store.objects.size).toBe(before.files + 2);
    expect(await variantCount()).toBe(before.rows + 2);
    expect((await unresolvedPendingChangeIds(db, 'exemplo-a')).length).toBeGreaterThan(
      pending.length,
    );
    // A mídia 1 (fixture) precisa da 1600 e não tem original: vai para o log, e a do
    // original seguinte é processada mesmo assim.
    expect(warnings).toEqual([expect.stringContaining('mídia 1 de exemplo-a sem original')]);
  });

  it('rodar duas vezes seguidas não grava arquivo nem registro na segunda', async () => {
    await reprocessSiteMedia({ db, store }, 'exemplo-a', withExtraWidth);
    const files = new Map(store.objects);
    const rows = await variantCount();
    const pending = await unresolvedPendingChangeIds(db, 'exemplo-a');

    const second = await reprocessSiteMedia({ db, store }, 'exemplo-a', withExtraWidth);

    expect(second).toEqual({ updated: [], withoutOriginal: [1], written: 0 });
    expect(store.objects).toEqual(files);
    expect(await variantCount()).toBe(rows);
    expect(await unresolvedPendingChangeIds(db, 'exemplo-a')).toEqual(pending);
  });

  it('sem mudança no perfil, nada a fazer', async () => {
    const files = store.objects.size;
    expect(await reprocessSiteMedia({ db, store }, 'exemplo-a')).toEqual({
      updated: [],
      withoutOriginal: [],
      written: 0,
    });
    expect(store.objects.size).toBe(files);
  });
});

describe('comando media:reprocess', () => {
  async function reprocessJobs(): Promise<string[]> {
    const result = await db.execute(sql`
      select j.key from graphile_worker._private_jobs j
      join graphile_worker._private_tasks t on t.id = j.task_id
      where t.identifier = 'media-reprocess' order by j.key`);
    return (result.rows as { key: string }[]).map((row) => row.key);
  }

  it('um job por site; repetir não duplica o que está na fila', async () => {
    expect(await scheduleMediaReprocess(db)).toEqual({
      ok: true,
      value: ['exemplo-a', 'exemplo-b'],
    });
    await scheduleMediaReprocess(db);
    await scheduleMediaReprocess(db, 'exemplo-a');
    expect(await reprocessJobs()).toEqual([
      'media-reprocess:exemplo-a',
      'media-reprocess:exemplo-b',
    ]);
  });

  it('site desconhecido é recusado sem enfileirar', async () => {
    expect(await scheduleMediaReprocess(db, 'nao-existe')).toMatchObject({
      ok: false,
      issues: [{ code: 'site.not_found' }],
    });
    expect(await reprocessJobs()).toEqual([]);
  });
});
