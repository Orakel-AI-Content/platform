import { describe, expect, it } from 'vitest';

import { memoryStore } from './store.ts';

const bytes = new Uint8Array([1]);

describe('memoryStore', () => {
  it('lista só as chaves do bucket pedido, com o prefixo opcional', async () => {
    const store = memoryStore();
    await store.put('media-a', 'img/1.webp', bytes, 1, 'image/webp');
    await store.put('media-a', 'outro/2.webp', bytes, 1, 'image/webp');
    await store.put('media-ab', 'img/3.webp', bytes, 1, 'image/webp');

    expect(await store.list('media-a')).toEqual(['img/1.webp', 'outro/2.webp']);
    expect(await store.list('media-a', 'img/')).toEqual(['img/1.webp']);
    expect(await store.list('media-inexistente')).toEqual([]);
  });

  it('remove em lote só no bucket pedido, ignorando chaves ausentes', async () => {
    const store = memoryStore();
    await store.put('media-a', 'x', bytes, 1, 'image/webp');
    await store.put('media-b', 'x', bytes, 1, 'image/webp');

    await store.deleteMany('media-a', ['x', 'nao-existe']);

    expect(await store.list('media-a')).toEqual([]);
    expect(await store.list('media-b')).toEqual(['x']);
  });
});
