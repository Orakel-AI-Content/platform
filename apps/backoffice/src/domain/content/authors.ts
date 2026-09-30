import type { Result } from '@orakel/content-model';
import type { Author } from '@orakel/content-model/v1';

import type { Executor } from '../../db/client.ts';
import { authors } from '../../db/schema/index.ts';
import { allocateId } from '../../db/site-ids.ts';
import type { Actor } from '../access/rbac.ts';
import { recordPendingChange } from '../pending-changes/record.ts';
import { checkWrite, type WriteOptions } from './write.ts';

export async function createAuthor(
  tx: Executor,
  actor: Actor,
  siteId: string,
  input: Omit<Author, 'id'>,
  options: WriteOptions = {},
): Promise<Result<{ id: number }>> {
  const allowed = checkWrite(actor);
  if (!allowed.ok) return allowed;
  const id = await allocateId(tx, siteId, 'author', options.id);
  await tx.insert(authors).values({ siteId, id, ...input });
  await recordPendingChange(tx, siteId, 'author', String(id));
  return { ok: true, value: { id } };
}
