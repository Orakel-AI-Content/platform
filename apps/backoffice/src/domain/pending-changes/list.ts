import type { Result } from '@orakel/content-model';
import { and, desc, eq, isNull } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { pendingChanges } from '../../db/schema/index.ts';
import { requireRole, type Actor } from '../access/rbac.ts';
import type { PendingOrigin } from './record.ts';

/** Mudança ainda não publicada de um site, como a tela de pendências a mostra (#99). */
export type PendingChange = {
  id: number;
  origin: PendingOrigin;
  /** ID do item (`42`) ou versão da configuração (`v3`), como `recordPendingChange` gravou. */
  reference: string;
  createdAt: Date;
};

/**
 * Mudanças do site que nenhum build bem-sucedido baixou ainda (o mesmo filtro de
 * `unresolvedPendingChangeIds`), da mais recente para a mais antiga. Uma linha por pendência:
 * o total bate com o número da lista de sites.
 */
export async function listPendingChanges(
  db: Executor,
  actor: Actor,
  siteId: string,
): Promise<Result<PendingChange[]>> {
  const allowed = requireRole(actor, 'site.read');
  if (!allowed.ok) return allowed;
  const rows = await db
    .select({
      id: pendingChanges.id,
      origin: pendingChanges.origin,
      reference: pendingChanges.reference,
      createdAt: pendingChanges.createdAt,
    })
    .from(pendingChanges)
    .where(and(eq(pendingChanges.siteId, siteId), isNull(pendingChanges.resolvedAt)))
    .orderBy(desc(pendingChanges.id));
  // A coluna é texto; só `recordPendingChange` grava, sempre com uma `PendingOrigin`.
  return { ok: true, value: rows.map((row) => ({ ...row, origin: row.origin as PendingOrigin })) };
}
