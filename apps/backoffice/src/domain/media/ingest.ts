import { createHash } from 'node:crypto';

import sharp from 'sharp';

import { detectImageFormat, EXTENSIONS, type ImageFormat } from './formats.ts';
import { ORIGINALS_BUCKET, type ObjectStore } from './store.ts';
import { UNREADABLE_REASON, type IngestPayload } from './upload.ts';

// Ingestão (12.0, L4), só no backoffice-worker: o envio cru vira o original normalizado em
// `media-originals/<site>/<sha256>.<ext>`, base das variantes. O nome pelo hash faz o
// reenvio da mesma imagem cair no mesmo arquivo.

/** Largura máxima do original; menores não são ampliadas. */
export const MAX_ORIGINAL_WIDTH = 2560;

export type NormalizedImage = {
  data: Buffer;
  format: ImageFormat;
  width: number;
  height: number;
};

/**
 * Aplica a orientação do EXIF, limita a largura e reencoda no mesmo formato. Sem
 * `withMetadata`/`keepMetadata`, o sharp não copia EXIF (com o GPS), XMP nem IPTC.
 */
export async function normalizeImage(
  input: Uint8Array,
  format: ImageFormat,
): Promise<NormalizedImage> {
  const pipeline = sharp(input)
    .rotate()
    .resize({ width: MAX_ORIGINAL_WIDTH, withoutEnlargement: true });
  const encoded = format === 'png' ? pipeline.png() : pipeline.toFormat(format, { quality: 90 });
  const { data, info } = await encoded.toBuffer({ resolveWithObject: true });
  return { data, format, width: info.width, height: info.height };
}

export type IngestResult =
  | { status: 'stored'; key: string; width: number; height: number }
  | { status: 'missing' }
  /** Arquivo que não é imagem aceita ou que o sharp não decodifica: recusa, não repete. */
  | { status: 'rejected'; reason: string };

/** Normaliza, ou `undefined` se o sharp não consegue decodificar (corpo corrompido). */
async function decodable(raw: Uint8Array, format: ImageFormat) {
  try {
    return await normalizeImage(raw, format);
  } catch {
    return undefined;
  }
}

/**
 * Normaliza um envio e guarda o original; o envio cru é apagado só depois. Repetir após uma
 * falha regrava o mesmo original; envio que já não existe (ingerido antes) é ignorado; arquivo
 * que não é imagem legível é recusado (#185).
 */
export async function ingestUpload(
  store: ObjectStore,
  payload: IngestPayload,
): Promise<IngestResult> {
  const raw = await store.get(ORIGINALS_BUCKET, payload.uploadKey);
  if (raw === undefined) return { status: 'missing' };
  const format = detectImageFormat(raw);
  const image = format === undefined ? undefined : await decodable(raw, format);
  if (format === undefined || image === undefined) {
    // Não adianta repetir: o arquivo cru sai e o envio é recusado (#185).
    await store.delete(ORIGINALS_BUCKET, payload.uploadKey);
    return { status: 'rejected', reason: UNREADABLE_REASON };
  }
  const hash = createHash('sha256').update(image.data).digest('hex');
  const key = `${payload.siteId}/${hash}.${EXTENSIONS[format]}`;
  await store.put(ORIGINALS_BUCKET, key, image.data, image.data.byteLength, `image/${format}`);
  await store.delete(ORIGINALS_BUCKET, payload.uploadKey);
  return { status: 'stored', key, width: image.width, height: image.height };
}
