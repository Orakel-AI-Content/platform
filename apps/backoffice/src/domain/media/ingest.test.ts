import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { ingestUpload, MAX_ORIGINAL_WIDTH, normalizeImage } from './ingest.ts';
import { memoryStore, ORIGINALS_BUCKET } from './store.ts';

// Fixtures geradas aqui: uma foto com EXIF (GPS e orientação), XMP e IPTC não cabe no
// repositório sem pesar, e assim cada teste diz o que a imagem carrega.

const GPS = { GPSLatitudeRef: 'S', GPSLatitude: '23/1 33/1 0/1', GPSLongitudeRef: 'W' };

/** O EXIF aponta para o bloco de GPS (tag 0x8825, em qualquer ordem de bytes). */
const hasGps = (exif: Buffer | undefined) =>
  exif !== undefined &&
  (exif.includes(Buffer.from([0x25, 0x88])) || exif.includes(Buffer.from([0x88, 0x25])));

async function photo(
  width: number,
  height: number,
  options: { orientation?: number } = {},
): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#6a8caf' } })
    .withExif({ IFD0: { Make: 'Câmera de teste' }, IFD3: GPS })
    .withXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF/></x:xmpmeta>')
    .withMetadata(options.orientation ? { orientation: options.orientation } : {})
    .jpeg()
    .toBuffer();
}

describe('normalizeImage', () => {
  it('foto de 4.000 px com GPS sai com 2.560 px e sem EXIF, XMP nem IPTC', async () => {
    const input = await photo(4000, 3000);
    const before = await sharp(input).metadata();
    expect(hasGps(before.exif)).toBe(true);
    expect(before.xmp).toBeDefined();

    const image = await normalizeImage(input, 'jpeg');
    const after = await sharp(image.data).metadata();
    expect(after).toMatchObject({ format: 'jpeg', width: MAX_ORIGINAL_WIDTH, height: 1920 });
    expect(after.exif).toBeUndefined();
    expect(after.xmp).toBeUndefined();
    expect(after.iptc).toBeUndefined();
  });

  it('imagem menor que 2.560 px não é ampliada', async () => {
    const image = await normalizeImage(await photo(1200, 800), 'jpeg');
    expect(image).toMatchObject({ width: 1200, height: 800 });
  });

  it('aplica a orientação do EXIF antes de limitar a largura', async () => {
    // Orientação 6: a foto 1600x1000 é exibida em pé, 1000x1600.
    const image = await normalizeImage(await photo(1600, 1000, { orientation: 6 }), 'jpeg');
    expect(image).toMatchObject({ width: 1000, height: 1600 });
    expect((await sharp(image.data).metadata()).orientation).toBeUndefined();
  });

  it('mantém o formato de entrada', async () => {
    const png = await sharp({
      create: { width: 3000, height: 100, channels: 4, background: '#00000000' },
    })
      .png()
      .toBuffer();
    const image = await normalizeImage(png, 'png');
    expect(await sharp(image.data).metadata()).toMatchObject({ format: 'png', width: 2560 });
  });
});

describe('ingestUpload', () => {
  const uploadKey = 'uploads/exemplo-a/envio.jpg';

  it('guarda o original em <site>/<sha256>.<ext> e apaga o envio cru', async () => {
    const store = memoryStore();
    const raw = await photo(4000, 3000);
    await store.put(ORIGINALS_BUCKET, uploadKey, raw, raw.byteLength, 'image/jpeg');

    const result = await ingestUpload(store, { siteId: 'exemplo-a', uploadKey });
    expect(result).toMatchObject({ status: 'stored', width: 2560, height: 1920 });
    if (result.status !== 'stored') return;
    expect(result.key).toMatch(/^exemplo-a\/[0-9a-f]{64}\.jpg$/);
    expect([...store.objects.keys()]).toEqual([`${ORIGINALS_BUCKET}/${result.key}`]);
  });

  it('a mesma imagem enviada de novo cai no mesmo original', async () => {
    const store = memoryStore();
    const raw = await photo(800, 600);
    const keys: string[] = [];
    for (const key of ['uploads/exemplo-a/a.jpg', 'uploads/exemplo-a/b.jpg']) {
      await store.put(ORIGINALS_BUCKET, key, raw, raw.byteLength, 'image/jpeg');
      const result = await ingestUpload(store, { siteId: 'exemplo-a', uploadKey: key });
      if (result.status === 'stored') keys.push(result.key);
    }
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(store.objects.size).toBe(1);
  });

  it('envio que já não existe é ignorado', async () => {
    expect(await ingestUpload(memoryStore(), { siteId: 'exemplo-a', uploadKey })).toEqual({
      status: 'missing',
    });
  });

  it('assinatura de JPEG com o corpo corrompido é recusada e o envio cru sai (#185)', async () => {
    const store = memoryStore();
    const raw = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]),
      Buffer.alloc(200, 0x2a),
    ]);
    await store.put(ORIGINALS_BUCKET, uploadKey, raw, raw.byteLength, 'image/jpeg');

    expect(await ingestUpload(store, { siteId: 'exemplo-a', uploadKey })).toEqual({
      status: 'rejected',
      reason: 'A imagem está corrompida ou não pôde ser lida',
    });
    expect(store.objects.size).toBe(0);
  });

  it('o que não é imagem aceita também é recusado, sem lançar', async () => {
    const store = memoryStore();
    const gif = Buffer.from('GIF89a', 'ascii');
    await store.put(ORIGINALS_BUCKET, uploadKey, gif, gif.byteLength, 'image/gif');

    expect(await ingestUpload(store, { siteId: 'exemplo-a', uploadKey })).toMatchObject({
      status: 'rejected',
    });
  });
});
