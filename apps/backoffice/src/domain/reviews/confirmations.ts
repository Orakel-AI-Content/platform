import type { Result } from '@orakel/content-model';
import { and, eq, inArray } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { reviewConfirmations as reviewConfirmationsTable } from '../../db/schema/index.ts';
import { requireRole, type Actor } from '../access/rbac.ts';
import {
  confirmedKeys,
  lockVersionInReview,
  refused,
  REVIEW_CHECKLIST,
  type ReviewChecklistKey,
} from './reviews.ts';

// Confirmações humanas da revisão gravadas por versão (#749): o revisor marca e desmarca cada
// item de REVIEW_CHECKLIST, ou todos, e o que marcou sobrevive a recarregar a tela. Só a versão
// mais recente em revisão aceita marcação, sob content.publish e a mesma trava da aprovação
// (lockVersionInReview), que lê daqui as chaves que exige.

/** Uma confirmação gravada: a chave, quem marcou e quando. */
export type ReviewConfirmation = {
  key: ReviewChecklistKey;
  confirmedBy: string;
  confirmedAt: Date;
};

const KEYS: readonly string[] = REVIEW_CHECKLIST.map((item) => item.key);

const isChecklistKey = (key: string): key is ReviewChecklistKey => KEYS.includes(key);

/**
 * Marca (`confirmed`) ou desmarca as chaves na versão, depois da permissão e da guarda. Marcar
 * de novo não duplica nem troca quem marcou primeiro. Devolve as chaves gravadas depois.
 */
async function setKeys(
  tx: Executor,
  actor: Actor,
  siteId: string,
  contentId: number,
  version: number,
  keys: readonly ReviewChecklistKey[],
  confirmed: boolean,
): Promise<Result<{ confirmed: ReviewChecklistKey[] }>> {
  const allowed = requireRole(actor, 'content.publish');
  if (!allowed.ok) return allowed;

  const locked = await lockVersionInReview(tx, siteId, contentId, version, 'conferida');
  if (!locked.ok) return locked;

  if (confirmed) {
    await tx
      .insert(reviewConfirmationsTable)
      .values(keys.map((key) => ({ siteId, contentId, version, key, confirmedBy: actor.email })))
      .onConflictDoNothing();
  } else {
    await tx
      .delete(reviewConfirmationsTable)
      .where(
        and(
          eq(reviewConfirmationsTable.siteId, siteId),
          eq(reviewConfirmationsTable.contentId, contentId),
          eq(reviewConfirmationsTable.version, version),
          inArray(reviewConfirmationsTable.key, [...keys]),
        ),
      );
  }
  return { ok: true, value: { confirmed: await confirmedKeys(tx, siteId, contentId, version) } };
}

/** Marca ou desmarca uma confirmação na versão; chave fora de `REVIEW_CHECKLIST` é recusada. */
export async function setConfirmation(
  tx: Executor,
  actor: Actor,
  siteId: string,
  contentId: number,
  version: number,
  key: string,
  confirmed: boolean,
): Promise<Result<{ confirmed: ReviewChecklistKey[] }>> {
  if (!isChecklistKey(key)) {
    return refused('review.unknown_confirmation', `Item de checklist desconhecido: ${key}`, [
      'key',
    ]);
  }
  return setKeys(tx, actor, siteId, contentId, version, [key], confirmed);
}

/** Marca ou desmarca todas as confirmações do checklist na versão de uma vez. */
export async function setAllConfirmations(
  tx: Executor,
  actor: Actor,
  siteId: string,
  contentId: number,
  version: number,
  confirmed: boolean,
): Promise<Result<{ confirmed: ReviewChecklistKey[] }>> {
  return setKeys(
    tx,
    actor,
    siteId,
    contentId,
    version,
    REVIEW_CHECKLIST.map((item) => item.key),
    confirmed,
  );
}

/**
 * Confirmações gravadas na versão, na ordem do checklist. Quem edita também lê (`site.read`),
 * como as checagens da revisão; marcar exige `content.publish`.
 */
export async function reviewConfirmations(
  db: Executor,
  actor: Actor,
  siteId: string,
  contentId: number,
  version: number,
): Promise<Result<ReviewConfirmation[]>> {
  const allowed = requireRole(actor, 'site.read');
  if (!allowed.ok) return allowed;

  const rows = await db
    .select({
      key: reviewConfirmationsTable.key,
      confirmedBy: reviewConfirmationsTable.confirmedBy,
      confirmedAt: reviewConfirmationsTable.confirmedAt,
    })
    .from(reviewConfirmationsTable)
    .where(
      and(
        eq(reviewConfirmationsTable.siteId, siteId),
        eq(reviewConfirmationsTable.contentId, contentId),
        eq(reviewConfirmationsTable.version, version),
      ),
    );
  const byKey = new Map(rows.map((row) => [row.key, row]));
  return {
    ok: true,
    value: REVIEW_CHECKLIST.flatMap(({ key }) => {
      const row = byKey.get(key);
      return row === undefined
        ? []
        : [{ key, confirmedBy: row.confirmedBy, confirmedAt: row.confirmedAt }];
    }),
  };
}
