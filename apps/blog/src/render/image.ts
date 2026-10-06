import type { Media } from '@orakel/content-model/v1';

type Variant = Media['variants'][number];

/** Formatos do `<picture>`, do mais eficiente ao mais aceito (AVIF antes de WebP). */
const FORMAT_ORDER = ['avif', 'webp'];

export function pictureFormats(media: Media): string[] {
  return [...new Set(media.variants.map((variant) => variant.format))].sort(
    (a, b) => (FORMAT_ORDER.indexOf(a) + 1 || 99) - (FORMAT_ORDER.indexOf(b) + 1 || 99),
  );
}

/**
 * Variante do `<img>` (navegador sem `<source>` compatível): no formato mais aceito, a
 * primeira com pelo menos 960 px; numa mídia menor que isso, a maior que existir.
 */
export function fallbackVariant(media: Media): Variant | undefined {
  const format = pictureFormats(media).at(-1);
  const candidates = media.variants
    .filter((variant) => variant.format === format)
    .sort((a, b) => a.width - b.width);
  return candidates.find((variant) => variant.width >= 960) ?? candidates.at(-1);
}
