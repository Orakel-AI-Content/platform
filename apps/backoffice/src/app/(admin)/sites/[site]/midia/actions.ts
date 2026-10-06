'use server';

import { currentActor } from '@/auth/request-actor.ts';
import type { MediaItem } from '@/components/media-library';
import { getDb } from '@/db/client.ts';
import { listMedia } from '@/domain/content/media.ts';
import { currentConfig } from '@/domain/sites/sites.ts';

import { mediaItems } from './items.ts';

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
