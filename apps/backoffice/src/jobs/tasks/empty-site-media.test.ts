import type { JobHelpers } from 'graphile-worker';
import { describe, expect, it, vi } from 'vitest';

import { memoryStore, ORIGINALS_BUCKET, type ObjectStore } from '../../domain/media/store.ts';
import type { Db } from '../../db/client.ts';
import { createEmptySiteMediaTask, emptySiteMedia } from './empty-site-media.ts';

const helpers = () => ({ logger: { info: vi.fn(), warn: vi.fn() } }) as unknown as JobHelpers;
const bytes = new Uint8Array([1]);

/** Store em memória que pagina a listagem como o S3 (1000 por página). */
function pagedStore() {
  const store = memoryStore();
  const pages: number[] = [];
  const list: ObjectStore['list'] = async (bucket, prefix) => {
    const all = await store.list(bucket, prefix);
    for (let i = 0; i < all.length; i += 1000) pages.push(Math.min(1000, all.length - i));
    return all;
  };
  return { ...store, list, pages };
}

async function fill(store: ObjectStore, bucket: string, count: number) {
  for (let i = 0; i < count; i += 1) {
    await store.put(bucket, `img/${i}.webp`, bytes, 1, 'image/webp');
  }
}

describe('empty-site-media', () => {
  it('esvazia media-<site> com mais de 1000 objetos e não toca nos originais', async () => {
    const store = pagedStore();
    await fill(store, 'media-exemplo-a', 1001);
    await store.put(ORIGINALS_BUCKET, 'exemplo-a/foto.jpg', bytes, 1, 'image/jpeg');
    await store.put('media-exemplo-b', 'img/x.webp', bytes, 1, 'image/webp');

    expect(await emptySiteMedia(store, 'exemplo-a')).toEqual({
      ok: true,
      bucket: 'media-exemplo-a',
      removed: 1001,
    });

    expect(await store.list('media-exemplo-a')).toEqual([]);
    expect(store.pages).toEqual([1000, 1]);
    expect(await store.list(ORIGINALS_BUCKET)).toEqual(['exemplo-a/foto.jpg']);
    expect(await store.list('media-exemplo-b')).toEqual(['img/x.webp']);
  });

  it('bucket inexistente ou vazio termina sem erro', async () => {
    expect(await emptySiteMedia(memoryStore(), 'exemplo-a')).toEqual({
      ok: true,
      bucket: 'media-exemplo-a',
      removed: 0,
    });
  });

  it('recusa o site originals sem remover nada', async () => {
    const store = memoryStore();
    await store.put(ORIGINALS_BUCKET, 'uploads/x', bytes, 1, 'image/jpeg');

    expect(await emptySiteMedia(store, 'originals')).toEqual({
      ok: false,
      message: expect.stringContaining('bucket dos originais') as string,
    });
    expect(await store.list(ORIGINALS_BUCKET)).toEqual(['uploads/x']);
  });

  it.each([null, {}, { siteId: '' }, { siteId: 7, runId: 1 }, { siteId: 'exemplo-a' }])(
    'recusa o payload %j',
    async (payload) => {
      await expect(
        createEmptySiteMediaTask({ db: {} as Db, store: memoryStore() })(payload, helpers()),
      ).rejects.toThrow('sem siteId ou runId');
    },
  );

  it('falha se sobrar objeto depois da remoção', async () => {
    const store = memoryStore();
    await fill(store, 'media-exemplo-a', 2);
    const stuck: ObjectStore = { ...store, deleteMany: () => Promise.resolve() };

    expect(await emptySiteMedia(stuck, 'exemplo-a')).toEqual({
      ok: false,
      message: 'media-exemplo-a ainda tem 2 objetos depois do esvaziamento',
    });
  });
});
