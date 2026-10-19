'use server';

import { currentActor } from '@/auth/request-actor.ts';
import type { MediaItem } from '@/components/media/MediaLibrary';
import { getDb } from '@/db/client.ts';
import { getMediaByIds, listMediaPage } from '@/domain/content/media.ts';
import { getUploads, type UploadState } from '@/domain/media/upload.ts';
import { currentConfig } from '@/domain/sites/sites.ts';

import { MEDIA_PAGE_SIZE, mediaItems } from './items.ts';

/** Uma página da grade de miniaturas (#180) ou da biblioteca (#186). */
export type MediaPage = { items: MediaItem[]; total: number; page: number; pageSize: number };

/**
 * Página `page` da biblioteca, com `MEDIA_PAGE_SIZE` mídias e o total, para a grade do editor
 * (#180) e para a releitura da tela Mídia depois de um envio, com a busca por nome (#186).
 * Papel no domínio (`site.read`); `null` sem sessão, permissão, site ou com página inválida.
 */
export async function listMediaPageAction(
  siteId: string,
  page: number,
  search = '',
): Promise<MediaPage | null> {
  const actor = await currentActor();
  if (!actor.ok) return null;
  const db = getDb().db;
  const result = await listMediaPage(db, actor.value, siteId, {
    page,
    pageSize: MEDIA_PAGE_SIZE,
    search,
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

/**
 * Estado dos envios pelas chaves devolvidas pela rota (#188), para a fila de envio acompanhar
 * cada arquivo até pronto ou recusado. `null` sem sessão, permissão ou com chaves demais.
 */
export async function uploadStatusAction(
  siteId: string,
  keys: string[],
): Promise<UploadState[] | null> {
  const actor = await currentActor();
  if (!actor.ok) return null;
  const result = await getUploads(getDb().db, actor.value, siteId, keys);
  return result.ok ? result.value : null;
}
