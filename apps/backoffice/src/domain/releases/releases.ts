import type { Result } from '@orakel/content-model';
import { desc } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { releases } from '../../db/schema/index.ts';
import { requireRole, type Actor } from '../access/rbac.ts';
import { RELEASE_TAG_MESSAGE, ReleaseTagSchema } from './tag.ts';

// Registro de versões do site-builder (L1): a operação cadastra as tags já publicadas no GHCR, e a
// ação "Reconstruir na release X" escolhe entre elas. Tabela operacional, fora do snapshot.
// Não confere a imagem no GHCR nem no host; editar e remover estão fora do escopo atual.

export type ReleaseRecord = { tag: string; registeredAt: Date };

/** Registra uma release; tag fora do formato ou já registrada é recusada. */
export async function registerRelease(
  tx: Executor,
  actor: Actor,
  tag: string,
): Promise<Result<ReleaseRecord>> {
  const allowed = requireRole(actor, 'release.promote');
  if (!allowed.ok) return allowed;

  const parsed = ReleaseTagSchema.safeParse(tag);
  if (!parsed.success) {
    return {
      ok: false,
      issues: [{ code: 'release.invalid_tag', message: RELEASE_TAG_MESSAGE, path: ['tag'] }],
    };
  }
  const [inserted] = await tx
    .insert(releases)
    .values({ tag: parsed.data })
    .onConflictDoNothing()
    .returning({ tag: releases.tag, registeredAt: releases.registeredAt });
  if (inserted === undefined) {
    return {
      ok: false,
      issues: [
        {
          code: 'release.exists',
          message: `A release ${parsed.data} já está registrada`,
          path: ['tag'],
        },
      ],
    };
  }
  return { ok: true, value: inserted };
}

/** Releases registradas, da mais recente para a mais antiga. */
export async function listReleases(db: Executor, actor: Actor): Promise<Result<ReleaseRecord[]>> {
  const allowed = requireRole(actor, 'release.promote');
  if (!allowed.ok) return allowed;

  const rows = await db
    .select({ tag: releases.tag, registeredAt: releases.registeredAt })
    .from(releases)
    .orderBy(desc(releases.registeredAt), desc(releases.tag));
  return { ok: true, value: rows };
}
