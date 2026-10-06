// Formatos aceitos no envio, reconhecidos pela assinatura dos primeiros bytes (nem o
// Content-Type nem a extensão contam). GIF, SVG e HEIC ficam de fora.

export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'avif';

/** Bytes suficientes para reconhecer qualquer formato aceito. */
export const SIGNATURE_BYTES = 12;

export const EXTENSIONS: Record<ImageFormat, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  avif: 'avif',
};

const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.subarray(start, end));

export function detectImageFormat(head: Uint8Array): ImageFormat | undefined {
  if (head.length < SIGNATURE_BYTES) return undefined;
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
  if (ascii(head, 0, 8) === '\x89PNG\r\n\x1a\n') return 'png';
  if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 12) === 'WEBP') return 'webp';
  if (ascii(head, 4, 8) === 'ftyp' && ['avif', 'avis'].includes(ascii(head, 8, 12))) {
    return 'avif';
  }
  return undefined;
}
