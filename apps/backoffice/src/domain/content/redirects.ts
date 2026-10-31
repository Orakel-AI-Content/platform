import type { Result } from '@orakel/content-model';
import type { Redirect } from '@orakel/content-model/v1';
import { and, eq } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { redirects } from '../../db/schema/index.ts';
import { allocateId } from '../../db/site-ids.ts';
import type { Action, Actor } from '../access/rbac.ts';
import { recordPendingChange } from '../pending-changes/record.ts';
import { checkWrite, type WriteOptions } from './write.ts';

/**
 * Redirect manual ou por troca de slug, sem cadeias: o redirect que saía do destino é
 * removido (voltar a um endereço antigo não colide com a origem dele) e todo redirect que
 * apontava para a origem passa a apontar para o destino (A→B e depois B→C dá A→C e B→C).
 * Cada linha inserida, reapontada ou removida registra mudança pendente. `action` é a
 * permissão exigida: a publicação grava o 301 da troca de slug com `content.publish`.
 */
export async function createRedirect(
  tx: Executor,
  actor: Actor,
  siteId: string,
  input: Omit<Redirect, 'id'>,
  options: WriteOptions & { action?: Action } = {},
): Promise<Result<{ id: number }>> {
  const allowed = checkWrite(actor, options.action);
  if (!allowed.ok) return allowed;

  const removed = await tx
    .delete(redirects)
    .where(and(eq(redirects.siteId, siteId), eq(redirects.from, input.to)))
    .returning({ id: redirects.id });
  const repointed = await tx
    .update(redirects)
    .set({ to: input.to })
    .where(and(eq(redirects.siteId, siteId), eq(redirects.to, input.from)))
    .returning({ id: redirects.id });
  const id = await allocateId(tx, siteId, 'redirect', options.id);
  await tx.insert(redirects).values({ siteId, id, ...input });

  for (const touched of [...removed, ...repointed, { id }]) {
    await recordPendingChange(tx, siteId, 'redirect', String(touched.id));
  }
  return { ok: true, value: { id } };
}
