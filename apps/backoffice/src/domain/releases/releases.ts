import type { Result } from '@orakel/content-model';
import { and, asc, desc, eq, isNull, ne, sql } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { releases, sites } from '../../db/schema/index.ts';
import type { RELEASE_IMAGE_STATUSES, RELEASE_PIPELINE_STATES } from '../../db/schema/releases.ts';
import { requireRole, type Actor } from '../access/rbac.ts';
import {
  compare,
  nextVersion,
  parse,
  RELEASE_BUMPS,
  type ReleaseBump,
  type Version,
} from './next-version.ts';

// Registro de versões do site-builder (L1): "Gerar nova versão" (`requestNewRelease`) cria a
// release antes de ela existir no GHCR, em `gerando`, com o número calculado pela tabela
// (`nextVersion`), e enfileira o run do release.yml; a ação "Reconstruir na release X" escolhe
// entre as registradas. Tabela operacional, fora do snapshot. Com o CI verde, a imagem é baixada
// e conferida no host (não no GHCR) por um job do build-runner, o único com acesso ao Docker
// (ADR 0011 da raiz). "Tentar de novo" (`retryRelease`) e "Descartar" (`discardRelease`) só
// mudam o estado; editar e remover estão fora do escopo atual.

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

/** Download e conferência da imagem site-builder:X.Y.Z no host; só o build-runner registra esta task. */
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
 * `replace`: pedidos repetidos antes de o job rodar viram um só. Com `runAt`, é o próprio job
 * se reagendando para a próxima consulta ao run (o job em execução perde a chave e termina).
 */
async function scheduleReleaseRun(tx: Executor, tag: string, runAt?: Date): Promise<void> {
  await tx.execute(sql`
    select graphile_worker.add_job(
      identifier => ${RELEASE_RUN_TASK},
      payload => ${JSON.stringify({ tag })}::json,
      run_at => ${runAt?.toISOString() ?? null}::timestamptz,
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

const rejected = (code: string, message: string): Result<never> => ({
  ok: false,
  issues: [{ code, message, path: ['tag'] }],
});

const notFound = (tag: string) =>
  rejected('release.not_found', `A release ${tag} não está registrada`);

const notFailed = (tag: string) =>
  rejected(
    'release.not_failed',
    `A release ${tag} não falhou; só uma release que falhou pode ser tentada de novo`,
  );

/**
 * "Tentar de novo": a release em `falhou` volta à etapa que falhou, com o mesmo número e sem o
 * motivo, e o job dessa etapa entra na fila, na transação de quem pede. A etapa sai do estado
 * gravado: só o download que falha grava `imageStatus = 'ausente'` (o CI não toca nele). Falha no
 * CI volta a `gerando` sem `runId` nem `runUrl`, para o `release-run` disparar um run novo em
 * vez de consultar o que falhou; falha no pull volta a `baixando`.
 */
export async function retryRelease(
  tx: Executor,
  actor: Actor,
  tag: string,
): Promise<Result<ReleaseRecord>> {
  const allowed = requireRole(actor, 'release.promote');
  if (!allowed.ok) return allowed;

  const [found] = await tx
    .select({ pipelineState: releases.pipelineState, imageStatus: releases.imageStatus })
    .from(releases)
    .where(eq(releases.tag, tag));
  if (found === undefined) return notFound(tag);
  if (found.pipelineState !== 'falhou') return notFailed(tag);

  const pullFailed = found.imageStatus === 'ausente';
  // Condicional em `falhou`: outro pedido simultâneo que já retomou ou descartou vence.
  const [updated] = await tx
    .update(releases)
    .set(
      pullFailed
        ? { pipelineState: 'baixando', failureReason: null }
        : { pipelineState: 'gerando', failureReason: null, runId: null, runUrl: null },
    )
    .where(and(eq(releases.tag, tag), eq(releases.pipelineState, 'falhou')))
    .returning(RECORD_COLUMNS);
  if (updated === undefined) return notFailed(tag);
  await (pullFailed ? scheduleImageCheck(tx, tag) : scheduleReleaseRun(tx, tag));
  return { ok: true, value: updated };
}

/**
 * "Descartar": a release vai a `descartada`, em qualquer estado, se nenhum site a usa
 * (`sites.release`). Os jobs do run e do download ignoram release fora da etapa deles, então
 * descartar no meio do pipeline não precisa cancelar job. O número continua contando para o
 * próximo (`requestNewRelease` lê todas as tags).
 */
export async function discardRelease(
  tx: Executor,
  actor: Actor,
  tag: string,
): Promise<Result<ReleaseRecord>> {
  const allowed = requireRole(actor, 'release.promote');
  if (!allowed.ok) return allowed;

  const [found] = await tx
    .select({ pipelineState: releases.pipelineState })
    .from(releases)
    .where(eq(releases.tag, tag));
  if (found === undefined) return notFound(tag);
  const alreadyDiscarded = rejected(
    'release.already_discarded',
    `A release ${tag} já foi descartada`,
  );
  if (found.pipelineState === 'descartada') return alreadyDiscarded;

  const using = await tx
    .select({ id: sites.id })
    .from(sites)
    .where(eq(sites.release, tag))
    .orderBy(asc(sites.id));
  if (using.length > 0) {
    const ids = using.map((s) => s.id).join(', ');
    return rejected(
      'release.in_use',
      `A release ${tag} está em uso por ${ids}; troque a versão desses sites antes de descartar`,
    );
  }

  const [updated] = await tx
    .update(releases)
    .set({ pipelineState: 'descartada' })
    .where(and(eq(releases.tag, tag), ne(releases.pipelineState, 'descartada')))
    .returning(RECORD_COLUMNS);
  if (updated === undefined) return alreadyDiscarded;
  return { ok: true, value: updated };
}

// Acompanhamento do run pelo job `release-run` (build-runner, sem ator). Toda transição parte
// de `gerando`: release descartada ou já adiante não muda, e a função devolve `false`.

/** Estado do pipeline e run já disparado da release; `undefined` se não está registrada. */
export async function loadReleaseRun(
  db: Executor,
  tag: string,
): Promise<{ pipelineState: ReleasePipelineState; runId: string | null } | undefined> {
  const [found] = await db
    .select({ pipelineState: releases.pipelineState, runId: releases.runId })
    .from(releases)
    .where(eq(releases.tag, tag));
  return found;
}

const generating = (tag: string) =>
  and(eq(releases.tag, tag), eq(releases.pipelineState, 'gerando'));

/** Grava o run disparado e agenda a primeira consulta, numa transação. */
export async function recordReleaseRunStarted(
  db: Executor,
  tag: string,
  run: { runId: string; runUrl: string },
  nextCheckAt: Date,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(releases)
      .set({ runId: run.runId, runUrl: run.runUrl })
      .where(and(generating(tag), isNull(releases.runId)))
      .returning({ tag: releases.tag });
    if (updated.length === 0) return false;
    await scheduleReleaseRun(tx, tag, nextCheckAt);
    return true;
  });
}

/** Run ainda em andamento: agenda a próxima consulta. */
export async function scheduleReleaseRunCheck(db: Executor, tag: string, at: Date): Promise<void> {
  await scheduleReleaseRun(db, tag, at);
}

/** CI verde: a release vai a `baixando` e o download da imagem entra na fila, juntos. */
export async function recordReleaseRunSucceeded(db: Executor, tag: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(releases)
      .set({ pipelineState: 'baixando', failureReason: null })
      .where(generating(tag))
      .returning({ tag: releases.tag });
    if (updated.length === 0) return false;
    await scheduleImageCheck(tx, tag);
    return true;
  });
}

/** CI vermelho, cancelado ou recusado pelo GitHub: `falhou` com o motivo. */
export async function recordReleaseRunFailed(
  db: Executor,
  tag: string,
  reason: string,
): Promise<boolean> {
  const updated = await db
    .update(releases)
    .set({ pipelineState: 'falhou', failureReason: reason })
    .where(generating(tag))
    .returning({ tag: releases.tag });
  return updated.length > 0;
}

// Download da imagem pelo job `check-release-image` (build-runner, sem ator). Toda transição
// parte de `baixando`: release descartada, já disponível ou ainda gerando não muda, e a função
// devolve `false`. `imageStatus` acompanha o resultado para quem ainda o lê (RebuildReleaseDialog).

const downloading = (tag: string) =>
  and(eq(releases.tag, tag), eq(releases.pipelineState, 'baixando'));

/** Imagem no host: a release fica `disponivel`. */
export async function recordReleaseImagePulled(
  db: Executor,
  tag: string,
  checkedAt: Date,
): Promise<boolean> {
  const updated = await db
    .update(releases)
    .set({
      pipelineState: 'disponivel',
      failureReason: null,
      imageStatus: 'disponivel',
      imageCheckedAt: checkedAt,
    })
    .where(downloading(tag))
    .returning({ tag: releases.tag });
  return updated.length > 0;
}

/** O download não trouxe a imagem depois das tentativas: `falhou` com o motivo do runtime. */
export async function recordReleaseImagePullFailed(
  db: Executor,
  tag: string,
  reason: string,
  checkedAt: Date,
): Promise<boolean> {
  const updated = await db
    .update(releases)
    .set({
      pipelineState: 'falhou',
      failureReason: reason,
      imageStatus: 'ausente',
      imageCheckedAt: checkedAt,
    })
    .where(downloading(tag))
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

/**
 * Mais recente das releases `disponivel`, em ordem numérica (1.10.0 > 1.9.0), ou `null` sem
 * nenhuma. Tags fora do formato X.Y.Z são ignoradas. Leitura interna, sem `Actor`: quem chama
 * (página do site, cadastro) já autorizou.
 */
export async function latestAvailableRelease(db: Executor): Promise<string | null> {
  const rows = await db
    .select({ tag: releases.tag })
    .from(releases)
    .where(eq(releases.pipelineState, 'disponivel'));

  let latest: { tag: string; version: Version } | undefined;
  for (const { tag } of rows) {
    const version = parse(tag);
    if (version !== undefined && (latest === undefined || compare(version, latest.version) > 0)) {
      latest = { tag, version };
    }
  }
  return latest?.tag ?? null;
}
