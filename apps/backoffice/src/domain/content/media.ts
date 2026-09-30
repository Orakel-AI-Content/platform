import type { Result } from '@orakel/content-model';
import type { Media } from '@orakel/content-model/v1';

import type { Executor } from '../../db/client.ts';
import { media, mediaVariants } from '../../db/schema/index.ts';
import { allocateId } from '../../db/site-ids.ts';
import type { Actor } from '../access/rbac.ts';
import { recordPendingChange } from '../pending-changes/record.ts';
import { checkWrite, type WriteOptions } from './write.ts';

/**
 * Registra uma mídia já processada e as variantes dela. A ingestão (upload, original sem
 * EXIF, variantes pelo perfil de imagem com sharp) é backlog do módulo Mídia.
 */
export async function createMedia(
  tx: Executor,
  actor: Actor,
  siteId: string,
  input: Omit<Media, 'id'>,
  options: WriteOptions = {},
): Promise<Result<{ id: number }>> {
  const allowed = checkWrite(actor);
  if (!allowed.ok) return allowed;
  const id = await allocateId(tx, siteId, 'media', options.id);
  await tx.insert(media).values({ siteId, id, width: input.width, height: input.height });
  await tx
    .insert(mediaVariants)
    .values(input.variants.map((variant) => ({ siteId, mediaId: id, ...variant })));
  await recordPendingChange(tx, siteId, 'media', String(id));
  return { ok: true, value: { id } };
}
