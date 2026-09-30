import type { Result } from '@orakel/content-model';
import type { Menu } from '@orakel/content-model/v1';

import type { Executor } from '../../db/client.ts';
import { menus } from '../../db/schema/index.ts';
import { allocateId } from '../../db/site-ids.ts';
import type { Actor } from '../access/rbac.ts';
import { recordPendingChange } from '../pending-changes/record.ts';
import { checkWrite, type WriteOptions } from './write.ts';

export async function createMenu(
  tx: Executor,
  actor: Actor,
  siteId: string,
  input: Omit<Menu, 'id'>,
  options: WriteOptions = {},
): Promise<Result<{ id: number }>> {
  const allowed = checkWrite(actor);
  if (!allowed.ok) return allowed;
  const id = await allocateId(tx, siteId, 'menu', options.id);
  await tx.insert(menus).values({ siteId, id, ...input });
  await recordPendingChange(tx, siteId, 'menu', String(id));
  return { ok: true, value: { id } };
}
