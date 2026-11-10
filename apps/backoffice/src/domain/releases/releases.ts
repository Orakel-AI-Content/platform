import type { Result } from '@orakel/content-model';
import { desc, eq, sql } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { releases } from '../../db/schema/index.ts';
import type { RELEASE_IMAGE_STATUSES } from '../../db/schema/releases.ts';
import { requireRole, type Actor } from '../access/rbac.ts';
import { RELEASE_TAG_MESSAGE, ReleaseTagSchema } from './tag.ts';

// Registro de releases do core (L1): a operação cadastra as tags já publicadas no GHCR, e a
// ação "Reconstruir na release X" escolhe entre elas. Tabela operacional, fora do snapshot.
// A imagem é conferida no host (não no GHCR) por um job do build-runner, o único com acesso ao
// Docker (ADR 0011 da raiz): o registro enfileira a conferência e a operação pode pedir de novo.
// Editar e remover estão fora do escopo atual.

export type ReleaseImageStatus = (typeof RELEASE_IMAGE_STATUSES)[number];

/** `imageStatus` e `imageCheckedAt` nulos: a imagem ainda não foi conferida. */
export type ReleaseRecord = {
  tag: string;
  registeredAt: Date;
  imageStatus: ReleaseImageStatus | null;
  imageCheckedAt: Date | null;
};

const RECORD_COLUMNS = {
  tag: releases.tag,
  registeredAt: releases.registeredAt,
  imageStatus: releases.imageStatus,
  imageCheckedAt: releases.imageCheckedAt,
};

/** Conferência da imagem site-builder:X.Y.Z no host; só o build-runner registra esta task. */
export const CHECK_RELEASE_IMAGE_TASK = 'check-release-image';

/**
 * Enfileira a conferência da imagem da release, na transação de quem pede. `job_key` por tag
 * com `replace`: pedidos repetidos antes de o job rodar viram um só.
 */
async function scheduleImageCheck(tx: Executor, tag: string): Promise<void> {
  await tx.execute(sql`
    select graphile_worker.add_job(
      identifier => ${CHECK_RELEASE_IMAGE_TASK},
      payload => ${JSON.stringify({ tag })}::json,
      max_attempts => 5,
      job_key => ${`release-image:${tag}`},
      job_key_mode => 'replace'
    )`);
}

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
    .returning(RECORD_COLUMNS);
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
  await scheduleImageCheck(tx, inserted.tag);
  return { ok: true, value: inserted };
}

/** Pede de novo a conferência da imagem de uma release registrada ("Reconferir"). */
export async function requestReleaseImageCheck(
  tx: Executor,
  actor: Actor,
  tag: string,
): Promise<Result<void>> {
  const allowed = requireRole(actor, 'release.promote');
  if (!allowed.ok) return allowed;

  const [found] = await tx
    .select({ tag: releases.tag })
    .from(releases)
    .where(eq(releases.tag, tag));
  if (found === undefined) {
    return {
      ok: false,
      issues: [
        {
          code: 'release.not_found',
          message: `A release ${tag} não está registrada`,
          path: ['tag'],
        },
      ],
    };
  }
  await scheduleImageCheck(tx, found.tag);
  return { ok: true, value: undefined };
}

/**
 * Grava o resultado da conferência (job do build-runner, sem ator). Devolve `false` se a
 * release não está registrada.
 */
export async function recordReleaseImageCheck(
  db: Executor,
  tag: string,
  available: boolean,
  checkedAt: Date,
): Promise<boolean> {
  const updated = await db
    .update(releases)
    .set({ imageStatus: available ? 'disponivel' : 'ausente', imageCheckedAt: checkedAt })
    .where(eq(releases.tag, tag))
    .returning({ tag: releases.tag });
  return updated.length > 0;
}

/** Releases registradas, da mais recente para a mais antiga. */
export async function listReleases(db: Executor, actor: Actor): Promise<Result<ReleaseRecord[]>> {
  const allowed = requireRole(actor, 'release.promote');
  if (!allowed.ok) return allowed;

  const rows = await db
    .select(RECORD_COLUMNS)
    .from(releases)
    .orderBy(desc(releases.registeredAt), desc(releases.tag));
  return { ok: true, value: rows };
}
