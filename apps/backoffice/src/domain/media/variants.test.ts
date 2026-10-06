import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { memoryStore, ORIGINALS_BUCKET } from './store.ts';
import { generateVariants } from './variants.ts';

const HASH = 'ab'.repeat(32);
const originalKey = `exemplo-a/${HASH}.jpg`;

async function storeWithOriginal(width: number, height: number) {
  const store = memoryStore();
  const data = await sharp({ create: { width, height, channels: 3, background: '#6a8caf' } })
    .jpeg()
    .toBuffer();
  await store.put(ORIGINALS_BUCKET, originalKey, data, data.byteLength, 'image/jpeg');
  return store;
}

const variantKeys = (store: ReturnType<typeof memoryStore>) =>
  [...store.objects.keys()].filter((key) => key.startsWith('media-exemplo-a/')).sort();

describe('generateVariants', () => {
  it('original de 2.560 px: as 10 variantes do perfil, com o nome pelo hash', async () => {
    const store = await storeWithOriginal(2560, 1440);
    const result = await generateVariants(store, {
      siteId: 'exemplo-a',
      originalKey,
      width: 2560,
      height: 1440,
    });

    expect(result).toMatchObject({ status: 'generated', written: 10 });
    const expected = [320, 640, 960, 1280, 1920].flatMap((w) =>
      ['avif', 'webp'].map((f) => `media-exemplo-a/exemplo-a/${HASH}-${w}.${f}`),
    );
    expect(variantKeys(store)).toEqual(expected.sort());
    const sample = store.objects.get(`media-exemplo-a/exemplo-a/${HASH}-640.webp`);
    expect(await sharp(sample).metadata()).toMatchObject({ format: 'webp', width: 640 });
    const avif = store.objects.get(`media-exemplo-a/exemplo-a/${HASH}-1920.avif`);
    expect(await sharp(avif).metadata()).toMatchObject({ format: 'heif', width: 1920 });
  });

  it('original de 800 px: nenhuma variante maior que 800 px', async () => {
    const store = await storeWithOriginal(800, 600);
    const result = await generateVariants(store, {
      siteId: 'exemplo-a',
      originalKey,
      width: 800,
      height: 600,
    });

    expect(result.status === 'generated' && result.media.variants.map((v) => v.width)).toEqual([
      320, 320, 640, 640,
    ]);
    expect(variantKeys(store)).toHaveLength(4);
  });

  it('original menor que 320 px: uma variante com a largura do original por formato', async () => {
    const store = await storeWithOriginal(200, 100);
    const result = await generateVariants(store, {
      siteId: 'exemplo-a',
      originalKey,
      width: 200,
      height: 100,
    });
    expect(result.status === 'generated' && result.media.variants).toEqual([
      { width: 200, format: 'avif', path: `exemplo-a/${HASH}-200.avif` },
      { width: 200, format: 'webp', path: `exemplo-a/${HASH}-200.webp` },
    ]);
  });

  it('não regrava variante que já existe (nome imutável)', async () => {
    const store = await storeWithOriginal(800, 600);
    const published = new Uint8Array([1, 2, 3]);
    const key = `exemplo-a/${HASH}-320.webp`;
    await store.put('media-exemplo-a', key, published, 3, 'image/webp');

    const payload = { siteId: 'exemplo-a', originalKey, width: 800, height: 600 };
    expect(await generateVariants(store, payload)).toMatchObject({ written: 3 });
    expect(store.objects.get(`media-exemplo-a/${key}`)).toEqual(published);
    expect(await generateVariants(store, payload)).toMatchObject({ written: 0 });
  });

  it('original que não existe mais: nada a fazer', async () => {
    expect(
      await generateVariants(memoryStore(), {
        siteId: 'exemplo-a',
        originalKey,
        width: 800,
        height: 600,
      }),
    ).toEqual({ status: 'missing' });
  });
});
