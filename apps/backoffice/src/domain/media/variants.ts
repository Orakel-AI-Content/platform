import {
  requiredImageWidths,
  RESOURCES,
  type Media,
  type Resources,
} from '@orakel/content-model/v1';
import sharp, { type FormatEnum } from 'sharp';

import type { Db } from '../../db/client.ts';
import { SYSTEM_ACTOR } from '../access/rbac.ts';
import { createMedia } from '../content/media.ts';
import { ORIGINALS_BUCKET, type ObjectStore } from './store.ts';

// Variantes do perfil de imagem (12.0, L4), só no backoffice-worker: a partir do original
// normalizado, uma por largura × formato em `media-<site>`, com o nome imutável pelo hash do
// original (`<site>/<hash>-<largura>.<formato>`, o `path` servido por `media.<domínio>`).
// Nenhuma é ampliada: as larguras são as que a regra do content-model exige do original.

export const VARIANTS_TASK = 'media-variants';

export type VariantsPayload = {
  siteId: string;
  /** Chave do original em `media-originals`: `<site>/<sha256>.<ext>`. */
  originalKey: string;
  width: number;
  height: number;
};

/** Bucket de mídia do site (um por site, como no R2). */
export const mediaBucket = (siteId: string) => `media-${siteId}`;

export type GeneratedVariants =
  { status: 'generated'; media: Omit<Media, 'id'>; written: number } | { status: 'missing' };

/**
 * Gera as variantes que ainda não existem no bucket do site. Variante já gravada (reenvio
 * da mesma imagem, ou repetição do job) é mantida: o nome é imutável.
 */
export async function generateVariants(
  store: ObjectStore,
  payload: VariantsPayload,
  resources: Resources = RESOURCES,
): Promise<GeneratedVariants> {
  const original = await store.get(ORIGINALS_BUCKET, payload.originalKey);
  if (original === undefined) return { status: 'missing' };
  const hash = /^[^/]+\/([0-9a-f]+)\.[a-z]+$/.exec(payload.originalKey)?.[1];
  if (hash === undefined) throw new Error(`Chave de original inválida: ${payload.originalKey}`);

  const bucket = mediaBucket(payload.siteId);
  const variants: Media['variants'] = [];
  let written = 0;
  for (const width of requiredImageWidths(payload.width, resources)) {
    for (const format of resources.imageProfile.formats) {
      const path = `${payload.siteId}/${hash}-${width}.${format}`;
      variants.push({ width, format, path });
      if (await store.exists(bucket, path)) continue;
      const data = await sharp(original)
        .resize({ width, withoutEnlargement: true })
        .toFormat(format as keyof FormatEnum)
        .toBuffer();
      await store.put(bucket, path, data, data.byteLength, `image/${format}`);
      written += 1;
    }
  }
  return {
    status: 'generated',
    media: { width: payload.width, height: payload.height, variants },
    written,
  };
}

export type RegisteredMedia =
  { status: 'registered'; id: number; variants: number; written: number } | { status: 'missing' };

/** Gera as variantes e registra a mídia (com a mudança pendente do site) pelo sistema. */
export async function registerMediaVariants(
  deps: { db: Db; store: ObjectStore },
  payload: VariantsPayload,
): Promise<RegisteredMedia> {
  const generated = await generateVariants(deps.store, payload);
  if (generated.status === 'missing') return generated;
  const created = await deps.db.transaction((tx) =>
    createMedia(tx, SYSTEM_ACTOR, payload.siteId, generated.media),
  );
  if (!created.ok) {
    // Variantes geradas pela própria regra do perfil: recusa aqui é bug, não conteúdo.
    throw new Error(`Mídia de ${payload.siteId} recusada: ${JSON.stringify(created.issues)}`);
  }
  return {
    status: 'registered',
    id: created.value.id,
    variants: generated.media.variants.length,
    written: generated.written,
  };
}
