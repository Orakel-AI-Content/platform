import type { JobHelpers } from 'graphile-worker';
import { describe, expect, it, vi } from 'vitest';

import { memoryStore, ORIGINALS_BUCKET, type ObjectStore } from '../../domain/media/store.ts';
import { createEmptySiteMediaTask } from './empty-site-media.ts';

const helpers = (info = vi.fn()) => ({ logger: { info, warn: vi.fn() } }) as unknown as JobHelpers;
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
    const info = vi.fn();

    await createEmptySiteMediaTask({ store })({ siteId: 'exemplo-a' }, helpers(info));

    expect(await store.list('media-exemplo-a')).toEqual([]);
    expect(store.pages).toEqual([1000, 1]);
    expect(await store.list(ORIGINALS_BUCKET)).toEqual(['exemplo-a/foto.jpg']);
    expect(await store.list('media-exemplo-b')).toEqual(['img/x.webp']);
    expect(info).toHaveBeenCalledWith('media-exemplo-a esvaziado: 1001 objetos removidos');
  });

  it('bucket inexistente ou vazio termina sem erro', async () => {
    await expect(
      createEmptySiteMediaTask({ store: memoryStore() })({ siteId: 'exemplo-a' }, helpers()),
    ).resolves.toBeUndefined();
  });

  it('recusa o site originals sem remover nada', async () => {
    const store = memoryStore();
    await store.put(ORIGINALS_BUCKET, 'uploads/x', bytes, 1, 'image/jpeg');

    await expect(
      createEmptySiteMediaTask({ store })({ siteId: 'originals' }, helpers()),
    ).rejects.toThrow('bucket dos originais');
    expect(await store.list(ORIGINALS_BUCKET)).toEqual(['uploads/x']);
  });

  it.each([null, {}, { siteId: '' }, { siteId: 7 }])('recusa o payload %j', async (payload) => {
    await expect(
      createEmptySiteMediaTask({ store: memoryStore() })(payload, helpers()),
    ).rejects.toThrow('sem siteId');
  });

  it('lança se sobrar objeto depois da remoção', async () => {
    const store = memoryStore();
    await fill(store, 'media-exemplo-a', 2);
    const stuck: ObjectStore = { ...store, deleteMany: () => Promise.resolve() };

    await expect(
      createEmptySiteMediaTask({ store: stuck })({ siteId: 'exemplo-a' }, helpers()),
    ).rejects.toThrow('ainda tem 2 objetos');
  });
});
