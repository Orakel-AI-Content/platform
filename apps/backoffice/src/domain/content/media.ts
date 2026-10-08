import type { Result } from '@orakel/content-model';
import { MediaSchema, validateMedia, type Media } from '@orakel/content-model/v1';
import { and, asc, count, eq, inArray } from 'drizzle-orm';

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

/**
 * Acrescenta variantes a uma mídia existente (reprocessamento após mudança do perfil de
 * imagem), com a mudança pendente do site. Variante que já está registrada é ignorada.
 */
export async function addMediaVariants(
  tx: Executor,
  actor: Actor,
  siteId: string,
  mediaId: number,
  variants: Media['variants'],
): Promise<Result<{ added: number }>> {
  const allowed = checkWrite(actor);
  if (!allowed.ok) return allowed;
  if (variants.length === 0) return { ok: true, value: { added: 0 } };
  const inserted = await tx
    .insert(mediaVariants)
    .values(variants.map((variant) => ({ siteId, mediaId, ...variant })))
    .onConflictDoNothing()
    .returning({ width: mediaVariants.width });
  if (inserted.length > 0) await recordPendingChange(tx, siteId, 'media', String(mediaId));
  return { ok: true, value: { added: inserted.length } };
}

type MediaRow = { id: number; width: number; height: number };
type VariantRow = { mediaId: number } & Media['variants'][number];

/** Junta cada mídia às suas variantes (já em ordem de largura e formato). */
function withVariants(rows: readonly MediaRow[], variants: readonly VariantRow[]): Media[] {
  return rows.map((row) => ({
    ...row,
    variants: variants
      .filter((variant) => variant.mediaId === row.id)
      .map(({ width, format, path }) => ({ width, format, path })),
  }));
}

const variantColumns = {
  mediaId: mediaVariants.mediaId,
  width: mediaVariants.width,
  format: mediaVariants.format,
  path: mediaVariants.path,
};
const variantOrder = [
  asc(mediaVariants.mediaId),
  asc(mediaVariants.width),
  asc(mediaVariants.format),
] as const;

/** Variantes só das mídias pedidas (a página ou a lista de ids), não do site inteiro. */
async function variantsOf(
  db: Executor,
  siteId: string,
  ids: readonly number[],
): Promise<VariantRow[]> {
  if (ids.length === 0) return [];
  return db
    .select(variantColumns)
    .from(mediaVariants)
    .where(and(eq(mediaVariants.siteId, siteId), inArray(mediaVariants.mediaId, [...ids])))
    .orderBy(...variantOrder);
}

/** Mídias do site com as variantes, em ordem de ID (tela Mídia). */
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
    .select(variantColumns)
    .from(mediaVariants)
    .where(eq(mediaVariants.siteId, siteId))
    .orderBy(...variantOrder);
  return { ok: true, value: withVariants(rows, variants) };
}

/** Maior página e maior lista de ids aceitas numa leitura. */
export const MAX_MEDIA_PAGE_SIZE = 100;

const isCount = (value: number, max = Number.MAX_SAFE_INTEGER) =>
  Number.isInteger(value) && value >= 1 && value <= max;

/**
 * Uma página da biblioteca do site (#180): no máximo `pageSize` mídias, em ordem de ID (estável
 * entre páginas), e o total do site. Para a grade do editor, que não carrega tudo de uma vez.
 */
export async function listMediaPage(
  db: Executor,
  actor: Actor,
  siteId: string,
  { page, pageSize }: { page: number; pageSize: number },
): Promise<Result<{ items: Media[]; total: number }>> {
  const allowed = requireRole(actor, 'site.read');
  if (!allowed.ok) return allowed;
  if (!isCount(page) || !isCount(pageSize, MAX_MEDIA_PAGE_SIZE)) {
    return {
      ok: false,
      issues: [
        {
          code: 'media.page_invalid',
          message: `Página e tamanho são inteiros a partir de 1; o tamanho vai até ${MAX_MEDIA_PAGE_SIZE}`,
          path: [],
        },
      ],
    };
  }
  const [counted] = await db.select({ total: count() }).from(media).where(eq(media.siteId, siteId));
  const rows = await db
    .select({ id: media.id, width: media.width, height: media.height })
    .from(media)
    .where(eq(media.siteId, siteId))
    .orderBy(asc(media.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const variants = await variantsOf(
    db,
    siteId,
    rows.map((row) => row.id),
  );
  return { ok: true, value: { items: withVariants(rows, variants), total: counted?.total ?? 0 } };
}

/**
 * Mídias do site pelos IDs (#180), em ordem de ID: a miniatura do valor atual de um campo.
 * IDs de outro site ou inexistentes ficam de fora.
 */
export async function getMediaByIds(
  db: Executor,
  actor: Actor,
  siteId: string,
  ids: readonly number[],
): Promise<Result<Media[]>> {
  const allowed = requireRole(actor, 'site.read');
  if (!allowed.ok) return allowed;
  if (ids.length > MAX_MEDIA_PAGE_SIZE || !ids.every((id) => isCount(id))) {
    return {
      ok: false,
      issues: [
        {
          code: 'media.ids_invalid',
          message: `Até ${MAX_MEDIA_PAGE_SIZE} IDs, inteiros a partir de 1`,
          path: [],
        },
      ],
    };
  }
  if (ids.length === 0) return { ok: true, value: [] };
  const rows = await db
    .select({ id: media.id, width: media.width, height: media.height })
    .from(media)
    .where(and(eq(media.siteId, siteId), inArray(media.id, [...new Set(ids)])))
    .orderBy(asc(media.id));
  const variants = await variantsOf(
    db,
    siteId,
    rows.map((row) => row.id),
  );
  return { ok: true, value: withVariants(rows, variants) };
}
