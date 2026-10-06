import type { Result } from '@orakel/content-model';
import { TaxonomySchema, type Taxonomy } from '@orakel/content-model/v1';
import { and, asc, eq, ne } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { taxonomies } from '../../db/schema/index.ts';
import { allocateId } from '../../db/site-ids.ts';
import { requireRole, type Actor } from '../access/rbac.ts';
import { recordPendingChange } from '../pending-changes/record.ts';
import { checkWrite, parseInput, refuse, type WriteOptions } from './write.ts';

type TaxonomyInput = Omit<Taxonomy, 'id'>;

const TaxonomyInputSchema = TaxonomySchema.omit({ id: true });

/** Slug livre entre as taxonomias do mesmo tipo no site (ignorando a própria, na edição). */
async function checkSlug(
  tx: Executor,
  siteId: string,
  input: TaxonomyInput,
  except?: number,
): Promise<Result<void>> {
  const taken = await tx
    .select({ id: taxonomies.id })
    .from(taxonomies)
    .where(
      and(
        eq(taxonomies.siteId, siteId),
        eq(taxonomies.kind, input.kind),
        eq(taxonomies.slug, input.slug),
        except === undefined ? undefined : ne(taxonomies.id, except),
      ),
    );
  return taken.length > 0
    ? refuse(
        'taxonomy.slug_exists',
        `Já existe uma taxonomia do tipo ${input.kind} com o slug ${input.slug} neste site`,
        ['slug'],
      )
    : { ok: true, value: undefined };
}

export async function createTaxonomy(
  tx: Executor,
  actor: Actor,
  siteId: string,
  input: TaxonomyInput,
  options: WriteOptions = {},
): Promise<Result<{ id: number }>> {
  const allowed = checkWrite(actor);
  if (!allowed.ok) return allowed;
  const parsed = parseInput(TaxonomyInputSchema, input);
  if (!parsed.ok) return parsed;
  const slug = await checkSlug(tx, siteId, parsed.value);
  if (!slug.ok) return slug;

  const id = await allocateId(tx, siteId, 'taxonomy', options.id);
  await tx.insert(taxonomies).values({ siteId, id, ...parsed.value });
  await recordPendingChange(tx, siteId, 'taxonomy', String(id));
  return { ok: true, value: { id } };
}

/** Edita uma taxonomia; a descrição ausente é apagada. */
export async function updateTaxonomy(
  tx: Executor,
  actor: Actor,
  siteId: string,
  id: number,
  input: TaxonomyInput,
): Promise<Result<void>> {
  const allowed = checkWrite(actor);
  if (!allowed.ok) return allowed;
  const parsed = parseInput(TaxonomyInputSchema, input);
  if (!parsed.ok) return parsed;
  const slug = await checkSlug(tx, siteId, parsed.value, id);
  if (!slug.ok) return slug;

  const { kind, slug: newSlug, name, description } = parsed.value;
  const updated = await tx
    .update(taxonomies)
    .set({ kind, slug: newSlug, name, description: description ?? null })
    .where(and(eq(taxonomies.siteId, siteId), eq(taxonomies.id, id)))
    .returning({ id: taxonomies.id });
  if (updated.length === 0) {
    return refuse('taxonomy.not_found', `Taxonomia ${id} não encontrada no site ${siteId}`);
  }
  await recordPendingChange(tx, siteId, 'taxonomy', String(id));
  return { ok: true, value: undefined };
}

/** Taxonomias do site, em ordem de ID; `kind` filtra por tipo. */
export async function listTaxonomies(
  db: Executor,
  actor: Actor,
  siteId: string,
  kind?: Taxonomy['kind'],
): Promise<Result<Taxonomy[]>> {
  const allowed = requireRole(actor, 'site.read');
  if (!allowed.ok) return allowed;
  const rows = await db
    .select()
    .from(taxonomies)
    .where(
      and(
        eq(taxonomies.siteId, siteId),
        kind === undefined ? undefined : eq(taxonomies.kind, kind),
      ),
    )
    .orderBy(asc(taxonomies.id));
  return {
    ok: true,
    value: rows.map(({ id, kind: rowKind, slug, name, description }) => ({
      id,
      kind: rowKind,
      slug,
      name,
      ...(description === null ? {} : { description }),
    })),
  };
}
