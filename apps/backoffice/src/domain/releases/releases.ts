import type { Result } from '@orakel/content-model';
import { desc, eq, sql } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { releases } from '../../db/schema/index.ts';
import type { RELEASE_IMAGE_STATUSES, RELEASE_PIPELINE_STATES } from '../../db/schema/releases.ts';
import { requireRole, type Actor } from '../access/rbac.ts';
import { nextVersion, RELEASE_BUMPS, type ReleaseBump } from './next-version.ts';

// Registro de versões do site-builder (L1): "Gerar nova versão" (`requestNewRelease`) cria a
// release antes de ela existir no GHCR, em `gerando`, com o número calculado pela tabela
// (`nextVersion`), e enfileira o run do release.yml; a ação "Reconstruir na release X" escolhe
// entre as registradas. Tabela operacional, fora do snapshot. A imagem é conferida no host (não
// no GHCR) por um job do build-runner, o único com acesso ao Docker (ADR 0011 da raiz), e a
// operação pode pedir a conferência de novo. Editar e remover estão fora do escopo atual.

export type ReleaseImageStatus = (typeof RELEASE_IMAGE_STATUSES)[number];
export type ReleasePipelineState = (typeof RELEASE_PIPELINE_STATES)[number];

/**
 * `imageStatus` e `imageCheckedAt` nulos: a imagem ainda não foi conferida. `runId` e `runUrl`
 * nulos até o build-runner disparar o run; `requestedBy` nulo nas releases cadastradas à mão.
 */
export type ReleaseRecord = {
  tag: string;
  registeredAt: Date;
  imageStatus: ReleaseImageStatus | null;
  imageCheckedAt: Date | null;
  pipelineState: ReleasePipelineState;
  runId: string | null;
  runUrl: string | null;
  failureReason: string | null;
  requestedBy: string | null;
};

const RECORD_COLUMNS = {
  tag: releases.tag,
  registeredAt: releases.registeredAt,
  imageStatus: releases.imageStatus,
  imageCheckedAt: releases.imageCheckedAt,
  pipelineState: releases.pipelineState,
  runId: releases.runId,
  runUrl: releases.runUrl,
  failureReason: releases.failureReason,
  requestedBy: releases.requestedBy,
};

/** Conferência da imagem site-builder:X.Y.Z no host; só o build-runner registra esta task. */
export const CHECK_RELEASE_IMAGE_TASK = 'check-release-image';

/**
 * Disparo e acompanhamento do run do release.yml para a release em `gerando`; só o
 * build-runner registra esta task (o único com a credencial do GitHub).
 */
export const RELEASE_RUN_TASK = 'release-run';

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

/**
 * Enfileira o run do release.yml da release, na transação de quem pede. `job_key` por tag com
 * `replace`: pedidos repetidos antes de o job rodar viram um só.
 */
async function scheduleReleaseRun(tx: Executor, tag: string): Promise<void> {
  await tx.execute(sql`
    select graphile_worker.add_job(
      identifier => ${RELEASE_RUN_TASK},
      payload => ${JSON.stringify({ tag })}::json,
      max_attempts => 5,
      job_key => ${`release-run:${tag}`},
      job_key_mode => 'replace'
    )`);
}

/**
 * "Gerar nova versão": calcula o número a partir de todas as tags registradas (descartadas
 * inclusive), grava a release em `gerando` com o solicitante e enfileira o run, tudo na
 * transação de quem pede. Dois pedidos simultâneos calculam o mesmo número; a chave primária
 * faz o segundo esperar o primeiro e ser recusado com `release.version_taken`.
 */
export async function requestNewRelease(
  tx: Executor,
  actor: Actor,
  bump: ReleaseBump,
): Promise<Result<ReleaseRecord>> {
  const allowed = requireRole(actor, 'release.promote');
  if (!allowed.ok) return allowed;

  if (!RELEASE_BUMPS.includes(bump)) {
    return {
      ok: false,
      issues: [
        {
          code: 'release.invalid_bump',
          message: 'Escolha correção, melhoria ou mudança grande',
          path: ['bump'],
        },
      ],
    };
  }

  const registered = await tx.select({ tag: releases.tag }).from(releases);
  const tag = nextVersion(
    registered.map((r) => r.tag),
    bump,
  );
  const [inserted] = await tx
    .insert(releases)
    .values({ tag, pipelineState: 'gerando', requestedBy: actor.email })
    .onConflictDoNothing()
    .returning(RECORD_COLUMNS);
  if (inserted === undefined) {
    return {
      ok: false,
      issues: [
        {
          code: 'release.version_taken',
          message: `A versão ${tag} acabou de ser pedida por outra pessoa; peça de novo`,
          path: ['bump'],
        },
      ],
    };
  }
  await scheduleReleaseRun(tx, inserted.tag);
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
