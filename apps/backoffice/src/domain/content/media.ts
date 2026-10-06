import type { Result } from '@orakel/content-model';
import { MediaSchema, validateMedia, type Media } from '@orakel/content-model/v1';
import { asc, eq } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { media, mediaVariants } from '../../db/schema/index.ts';
import { allocateId } from '../../db/site-ids.ts';
import { requireRole, type Actor } from '../access/rbac.ts';
import { recordPendingChange } from '../pending-changes/record.ts';
import { checkWrite, parseInput, type WriteOptions } from './write.ts';

const MediaInputSchema = MediaSchema.omit({ id: true });

/**
 * Registra uma mídia já processada e as variantes dela (geradas pelo job `media-variants`
 * ou vindas da importação), com o original de onde saíram (`originalKey`, para o
 * reprocessamento). Recusa variantes que não cobrem o perfil de imagem exigido para
 * a largura do original (`validateMedia`).
 */
export async function createMedia(
  tx: Executor,
  actor: Actor,
  siteId: string,
  input: Omit<Media, 'id'>,
  options: WriteOptions & { originalKey?: string } = {},
): Promise<Result<{ id: number }>> {
  const allowed = checkWrite(actor);
  if (!allowed.ok) return allowed;
  const parsed = parseInput(MediaInputSchema, input);
  if (!parsed.ok) return parsed;
  const valid = validateMedia({ id: options.id ?? 1, ...parsed.value });
  if (!valid.ok) return valid;
  const { width, height, variants } = parsed.value;
  const id = await allocateId(tx, siteId, 'media', options.id);
  await tx.insert(media).values({ siteId, id, width, height, originalKey: options.originalKey });
  await tx
    .insert(mediaVariants)
    .values(variants.map((variant) => ({ siteId, mediaId: id, ...variant })));
  await recordPendingChange(tx, siteId, 'media', String(id));
  return { ok: true, value: { id } };
}

/** Mídias do site com as variantes, em ordem de ID (seletor do bloco de imagem). */
export async function listMedia(
  db: Executor,
  actor: Actor,
  siteId: string,
): Promise<Result<Media[]>> {
  const allowed = requireRole(actor, 'site.read');
  if (!allowed.ok) return allowed;
  const rows = await db
    .select({ id: media.id, width: media.width, height: media.height })
    .from(media)
    .where(eq(media.siteId, siteId))
    .orderBy(asc(media.id));
  const variants = await db
    .select({
      mediaId: mediaVariants.mediaId,
      width: mediaVariants.width,
      format: mediaVariants.format,
      path: mediaVariants.path,
    })
    .from(mediaVariants)
    .where(eq(mediaVariants.siteId, siteId))
    .orderBy(asc(mediaVariants.mediaId), asc(mediaVariants.width), asc(mediaVariants.format));
  return {
    ok: true,
    value: rows.map((row) => ({
      ...row,
      variants: variants
        .filter((variant) => variant.mediaId === row.id)
        .map(({ width, format, path }) => ({ width, format, path })),
    })),
  };
}
