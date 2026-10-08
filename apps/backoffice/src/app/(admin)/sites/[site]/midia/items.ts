import type { Media } from '@orakel/content-model/v1';
import { mediaUrl } from '@orakel/core/v1';

import type { MediaItem } from '@/components/media-library';

/**
 * Mídias por página na grade do editor (#180). Fica fora de `actions.ts` porque um módulo
 * `'use server'` só exporta funções; o cliente não escolhe o tamanho.
 */
export const MEDIA_PAGE_SIZE = 24;

/** Formatos da miniatura, do preferido ao de reserva (`<source>` antes, `<img>` por último). */
const THUMBNAIL_FORMATS = ['avif', 'webp'];

/**
 * Miniatura de cada mídia: a menor largura registrada, em `media.<domínio>` (a mesma regra
 * do site, `mediaUrl`). Formato fora do perfil entra só como reserva.
 */
export function mediaItems(domain: string, media: readonly Media[]): MediaItem[] {
  const config = { domains: [domain] };
  return media.map(({ id, width, height, variants }) => {
    const smallest = Math.min(...variants.map((variant) => variant.width));
    const candidates = variants
      .filter((variant) => variant.width === smallest)
      .sort((a, b) => rank(a.format) - rank(b.format));
    const urls = candidates.map((variant) => ({
      type: `image/${variant.format}`,
      url: mediaUrl(config, variant.path),
    }));
    const fallback = urls.at(-1);
    return {
      id,
      width,
      height,
      sources: urls.slice(0, -1),
      src: fallback?.url ?? '',
    };
  });
}

function rank(format: string): number {
  const index = THUMBNAIL_FORMATS.indexOf(format);
  return index === -1 ? THUMBNAIL_FORMATS.length : index;
}
