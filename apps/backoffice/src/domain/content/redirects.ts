import type { Result } from '@orakel/content-model';
import type { Redirect } from '@orakel/content-model/v1';

import type { Executor } from '../../db/client.ts';
import { redirects } from '../../db/schema/index.ts';
import { allocateId } from '../../db/site-ids.ts';
import type { Actor } from '../access/rbac.ts';
import { recordPendingChange } from '../pending-changes/record.ts';
import { checkWrite, type WriteOptions } from './write.ts';

/** Redirect manual ou por troca de slug. O achatamento de cadeias entra com o módulo Publicação. */
export async function createRedirect(
  tx: Executor,
  actor: Actor,
  siteId: string,
  input: Omit<Redirect, 'id'>,
  options: WriteOptions = {},
): Promise<Result<{ id: number }>> {
  const allowed = checkWrite(actor);
  if (!allowed.ok) return allowed;
  const id = await allocateId(tx, siteId, 'redirect', options.id);
  await tx.insert(redirects).values({ siteId, id, ...input });
  await recordPendingChange(tx, siteId, 'redirect', String(id));
  return { ok: true, value: { id } };
}
