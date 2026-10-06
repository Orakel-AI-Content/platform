import type { Result } from '@orakel/content-model';
import { AuthorSchema, type Author } from '@orakel/content-model/v1';
import { and, asc, eq, ne } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { authors } from '../../db/schema/index.ts';
import { allocateId } from '../../db/site-ids.ts';
import { requireRole, type Actor } from '../access/rbac.ts';
import { recordPendingChange } from '../pending-changes/record.ts';
import { checkWrite, parseInput, refuse, type WriteOptions } from './write.ts';

type AuthorInput = Omit<Author, 'id'>;

const AuthorInputSchema = AuthorSchema.omit({ id: true });

/** Slug livre no site (ignorando o próprio autor, na edição). */
async function checkSlug(
  tx: Executor,
  siteId: string,
  slug: string,
  except?: number,
): Promise<Result<void>> {
  const taken = await tx
    .select({ id: authors.id })
    .from(authors)
    .where(
      and(
        eq(authors.siteId, siteId),
        eq(authors.slug, slug),
        except === undefined ? undefined : ne(authors.id, except),
      ),
    );
  return taken.length > 0
    ? refuse('author.slug_exists', `Já existe um autor com o slug ${slug} neste site`, ['slug'])
    : { ok: true, value: undefined };
}

export async function createAuthor(
  tx: Executor,
  actor: Actor,
  siteId: string,
  input: AuthorInput,
  options: WriteOptions = {},
): Promise<Result<{ id: number }>> {
  const allowed = checkWrite(actor);
  if (!allowed.ok) return allowed;
  const parsed = parseInput(AuthorInputSchema, input);
  if (!parsed.ok) return parsed;
  const slug = await checkSlug(tx, siteId, parsed.value.slug);
  if (!slug.ok) return slug;

  const id = await allocateId(tx, siteId, 'author', options.id);
  await tx.insert(authors).values({ siteId, id, ...parsed.value });
  await recordPendingChange(tx, siteId, 'author', String(id));
  return { ok: true, value: { id } };
}

/** Edita um autor; campos opcionais ausentes são apagados. */
export async function updateAuthor(
  tx: Executor,
  actor: Actor,
  siteId: string,
  id: number,
  input: AuthorInput,
): Promise<Result<void>> {
  const allowed = checkWrite(actor);
  if (!allowed.ok) return allowed;
  const parsed = parseInput(AuthorInputSchema, input);
  if (!parsed.ok) return parsed;
  const slug = await checkSlug(tx, siteId, parsed.value.slug, id);
  if (!slug.ok) return slug;

  const { slug: newSlug, name, bio, expertise, avatarMediaId } = parsed.value;
  const updated = await tx
    .update(authors)
    .set({
      slug: newSlug,
      name,
      bio: bio ?? null,
      expertise: expertise ?? null,
      avatarMediaId: avatarMediaId ?? null,
    })
    .where(and(eq(authors.siteId, siteId), eq(authors.id, id)))
    .returning({ id: authors.id });
  if (updated.length === 0) {
    return refuse('author.not_found', `Autor ${id} não encontrado no site ${siteId}`);
  }
  await recordPendingChange(tx, siteId, 'author', String(id));
  return { ok: true, value: undefined };
}

/** Autores do site, em ordem de ID. */
export async function listAuthors(
  db: Executor,
  actor: Actor,
  siteId: string,
): Promise<Result<Author[]>> {
  const allowed = requireRole(actor, 'site.read');
  if (!allowed.ok) return allowed;
  const rows = await db
    .select()
    .from(authors)
    .where(eq(authors.siteId, siteId))
    .orderBy(asc(authors.id));
  return {
    ok: true,
    value: rows.map(({ id, slug, name, bio, expertise, avatarMediaId }) => ({
      id,
      slug,
      name,
      ...(bio === null ? {} : { bio }),
      ...(expertise === null ? {} : { expertise }),
      ...(avatarMediaId === null ? {} : { avatarMediaId }),
    })),
  };
}
