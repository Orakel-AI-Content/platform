import type { Result } from '@orakel/content-model';
import { MenuSchema, type Menu } from '@orakel/content-model/v1';
import { and, asc, eq, ne } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { menus } from '../../db/schema/index.ts';
import { allocateId } from '../../db/site-ids.ts';
import { requireRole, type Actor } from '../access/rbac.ts';
import { recordPendingChange } from '../pending-changes/record.ts';
import { checkWrite, parseInput, refuse, type WriteOptions } from './write.ts';

type MenuInput = Omit<Menu, 'id'>;

const MenuInputSchema = MenuSchema.omit({ id: true });

/** `key` livre no site (ignorando o próprio menu, na edição). */
async function checkKey(
  tx: Executor,
  siteId: string,
  key: string,
  except?: number,
): Promise<Result<void>> {
  const taken = await tx
    .select({ id: menus.id })
    .from(menus)
    .where(
      and(
        eq(menus.siteId, siteId),
        eq(menus.key, key),
        except === undefined ? undefined : ne(menus.id, except),
      ),
    );
  return taken.length > 0
    ? refuse('menu.key_exists', `Já existe um menu ${key} neste site`, ['key'])
    : { ok: true, value: undefined };
}

export async function createMenu(
  tx: Executor,
  actor: Actor,
  siteId: string,
  input: MenuInput,
  options: WriteOptions = {},
): Promise<Result<{ id: number }>> {
  const allowed = checkWrite(actor);
  if (!allowed.ok) return allowed;
  const parsed = parseInput(MenuInputSchema, input);
  if (!parsed.ok) return parsed;
  const key = await checkKey(tx, siteId, parsed.value.key);
  if (!key.ok) return key;

  const id = await allocateId(tx, siteId, 'menu', options.id);
  await tx.insert(menus).values({ siteId, id, ...parsed.value });
  await recordPendingChange(tx, siteId, 'menu', String(id));
  return { ok: true, value: { id } };
}

export async function updateMenu(
  tx: Executor,
  actor: Actor,
  siteId: string,
  id: number,
  input: MenuInput,
): Promise<Result<void>> {
  const allowed = checkWrite(actor);
  if (!allowed.ok) return allowed;
  const parsed = parseInput(MenuInputSchema, input);
  if (!parsed.ok) return parsed;
  const key = await checkKey(tx, siteId, parsed.value.key, id);
  if (!key.ok) return key;

  const updated = await tx
    .update(menus)
    .set(parsed.value)
    .where(and(eq(menus.siteId, siteId), eq(menus.id, id)))
    .returning({ id: menus.id });
  if (updated.length === 0) {
    return refuse('menu.not_found', `Menu ${id} não encontrado no site ${siteId}`);
  }
  await recordPendingChange(tx, siteId, 'menu', String(id));
  return { ok: true, value: undefined };
}

/** Menus do site, em ordem de ID. */
export async function listMenus(
  db: Executor,
  actor: Actor,
  siteId: string,
): Promise<Result<Menu[]>> {
  const allowed = requireRole(actor, 'site.read');
  if (!allowed.ok) return allowed;
  const rows = await db
    .select({ id: menus.id, key: menus.key, items: menus.items })
    .from(menus)
    .where(eq(menus.siteId, siteId))
    .orderBy(asc(menus.id));
  return { ok: true, value: rows };
}
