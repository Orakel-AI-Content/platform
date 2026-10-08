'use server';

import { currentActor } from '@/auth/request-actor.ts';
import type { MediaItem } from '@/components/media-library';
import { getDb } from '@/db/client.ts';
import { getMediaByIds, listMedia, listMediaPage } from '@/domain/content/media.ts';
import { currentConfig } from '@/domain/sites/sites.ts';

import { MEDIA_PAGE_SIZE, mediaItems } from './items.ts';

/**
 * Releitura da biblioteca enquanto há envio processando (#52): papel no `listMedia`
 * (`site.read`); `null` quando não há sessão, permissão ou site.
 */
export async function listMediaAction(siteId: string): Promise<MediaItem[] | null> {
  const actor = await currentActor();
  if (!actor.ok) return null;
  const db = getDb().db;
  const media = await listMedia(db, actor.value, siteId);
  if (!media.ok) return null;
  const config = await currentConfig(db, siteId);
  if (config === undefined) return null;
  return mediaItems(config.domains[0] ?? '', media.value);
}

/** Uma página da grade de miniaturas (#180). */
export type MediaPage = { items: MediaItem[]; total: number; page: number; pageSize: number };

/**
 * Página `page` da biblioteca, com `MEDIA_PAGE_SIZE` mídias e o total, para a grade do editor
 * (#180). Papel no domínio (`site.read`); `null` sem sessão, permissão, site ou com página
 * inválida.
 */
export async function listMediaPageAction(siteId: string, page: number): Promise<MediaPage | null> {
  const actor = await currentActor();
  if (!actor.ok) return null;
  const db = getDb().db;
  const result = await listMediaPage(db, actor.value, siteId, {
    page,
    pageSize: MEDIA_PAGE_SIZE,
  });
  if (!result.ok) return null;
  const config = await currentConfig(db, siteId);
  if (config === undefined) return null;
  return {
    items: mediaItems(config.domains[0] ?? '', result.value.items),
    total: result.value.total,
    page,
    pageSize: MEDIA_PAGE_SIZE,
  };
}

/**
 * Mídias do site pelos IDs, já com a miniatura (#180): o valor atual de um campo. IDs de outro
 * site ou inexistentes ficam de fora; `null` sem sessão, permissão, site ou com IDs inválidos.
 */
export async function mediaByIdsAction(siteId: string, ids: number[]): Promise<MediaItem[] | null> {
  const actor = await currentActor();
  if (!actor.ok) return null;
  const db = getDb().db;
  const result = await getMediaByIds(db, actor.value, siteId, ids);
  if (!result.ok) return null;
  const config = await currentConfig(db, siteId);
  if (config === undefined) return null;
  return mediaItems(config.domains[0] ?? '', result.value);
}
