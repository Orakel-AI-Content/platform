// Builds no banco (12.0, L3): o que o build-runner precisa antes de começar e o registro do
// resultado. Com sucesso, a mesma transação grava o build e baixa as mudanças pela lista
// que o snapshot viu; com falha permanente, pausa o site com o motivo. "Reverter" (L4) escolhe
// entre as versões dos builds `ok` e enfileira o rollback.
import type { Result } from '@orakel/content-model';
import { and, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { builds, pendingChanges, sites } from '../../db/schema/index.ts';
import { requireRole, type Actor } from '../access/rbac.ts';
import { currentConfig } from '../sites/sites.ts';
import type { BuildOutcome } from './run-build.ts';
import { buildNow, scheduleRollback } from './schedule.ts';
import { clearMassUnpublish, markPublished, pauseSite, setActiveVersion } from './site-state.ts';

export type BuildTarget = {
  siteId: string;
  state: (typeof sites.$inferSelect)['state'];
  pausedReason: string | null;
  /** Release registrada; nula até a primeira promoção. */
  release: string | null;
  /** Domínio principal da configuração corrente. */
  domain: string;
  /** Páginas do build da versão ativa (`sites.activeVersionId`): referência da trava. */
  activePages: number | undefined;
  /** Despublicação em massa declarada e não consumida: libera a trava neste build. */
  massUnpublishDeclaredAt: Date | null;
};

/** Páginas e arquivos do build que pôs no ar a versão ativa do site. */
export type ActiveBuild = { pages: number | null; files: number | null };

/**
 * Build da versão ativa: o `ok` mais recente com `versionId = sites.activeVersionId`. Não é o
 * último build: depois de um rollback ou de um build falho, o último não é o que está no ar.
 */
export async function activeBuild(
  db: Executor,
  siteId: string,
  activeVersionId: string | null,
): Promise<ActiveBuild | undefined> {
  if (activeVersionId === null) return undefined;
  const [row] = await db
    .select({ pages: builds.pages, files: builds.files })
    .from(builds)
    .where(
      and(
        eq(builds.siteId, siteId),
        eq(builds.status, 'ok'),
        eq(builds.versionId, activeVersionId),
      ),
    )
    .orderBy(desc(builds.finishedAt), desc(builds.id))
    .limit(1);
  return row;
}

export async function loadBuildTarget(
  db: Executor,
  siteId: string,
): Promise<BuildTarget | undefined> {
  const [site] = await db.select().from(sites).where(eq(sites.id, siteId));
  if (site === undefined) return undefined;
  const config = await currentConfig(db, siteId);
  const active = await activeBuild(db, siteId, site.activeVersionId);
  return {
    siteId,
    state: site.state,
    pausedReason: site.pausedReason,
    release: site.release,
    domain: config?.domains[0] ?? '',
    activePages: active?.pages ?? undefined,
    massUnpublishDeclaredAt: site.massUnpublishDeclaredAt,
  };
}

export type BuildRun = {
  siteId: string;
  release: string;
  jobId: string | undefined;
  attempt: number;
  startedAt: Date;
  /** Declaração de despublicação em massa que o plano usou; o sucesso a consome. */
  massUnpublishDeclaredAt?: Date | null;
};

/** Registra a tentativa e aplica o efeito no site e nas mudanças pendentes. */
export async function recordBuild(
  tx: Executor,
  run: BuildRun,
  outcome: BuildOutcome,
): Promise<number> {
  const common = {
    siteId: run.siteId,
    release: run.release,
    jobId: run.jobId ?? null,
    attempt: run.attempt,
    startedAt: run.startedAt,
  };
  if (outcome.status === 'ok') {
    const ids = outcome.render.pendingChangeIds;
    const [row] = await tx
      .insert(builds)
      .values({
        ...common,
        status: 'ok',
        pendingChangeIds: ids,
        pages: outcome.render.pages,
        files: outcome.render.files,
        versionId: outcome.publish.versionId,
        cacheKey: outcome.publish.cacheKey,
        renderMs: outcome.renderMs,
        publishMs: outcome.publishMs,
      })
      .returning({ id: builds.id });
    if (ids.length > 0) {
      await tx
        .update(pendingChanges)
        .set({ resolvedAt: new Date() })
        .where(
          and(
            eq(pendingChanges.siteId, run.siteId),
            inArray(pendingChanges.id, ids),
            isNull(pendingChanges.resolvedAt),
          ),
        );
    }
    await markPublished(tx, run.siteId);
    await setActiveVersion(tx, run.siteId, outcome.publish.versionId);
    const declaredAt = run.massUnpublishDeclaredAt ?? null;
    if (declaredAt !== null) await clearMassUnpublish(tx, run.siteId, declaredAt);
    return row?.id ?? 0;
  }

  const [row] = await tx
    .insert(builds)
    .values({
      ...common,
      status: 'failed',
      failedStage: outcome.stage,
      failureKind: outcome.failure.kind,
      failureMessage: outcome.failure.message,
      pendingChangeIds: outcome.render?.pendingChangeIds ?? [],
      pages: outcome.render?.pages ?? null,
      files: outcome.render?.files ?? null,
      renderMs: outcome.renderMs ?? null,
      publishMs: outcome.publishMs ?? null,
    })
    .returning({ id: builds.id });
  if (outcome.failure.kind === 'permanent') {
    await pauseSite(
      tx,
      run.siteId,
      `${outcome.stage}: ${outcome.failure.message}`,
      outcome.failure.culprit,
    );
  }
  return row?.id ?? 0;
}

export type LastBuild = {
  status: (typeof builds.$inferSelect)['status'];
  versionId: string | null;
  finishedAt: Date;
};

/** Último build de cada site, para o Registro de instâncias. */
export async function lastBuilds(db: Executor): Promise<Map<string, LastBuild>> {
  const rows = await db
    .selectDistinctOn([builds.siteId], {
      siteId: builds.siteId,
      status: builds.status,
      versionId: builds.versionId,
      finishedAt: builds.finishedAt,
    })
    .from(builds)
    .orderBy(builds.siteId, desc(builds.finishedAt), desc(builds.id));
  return new Map(rows.map(({ siteId, ...last }) => [siteId, last]));
}

/** Um dos últimos builds de um site, como o resumo da página do site os mostra. */
export type RecentBuild = LastBuild & { id: number; release: string };

/** Quantos builds o resumo do site mostra. */
export const RECENT_BUILDS_LIMIT = 5;

/** Os builds mais recentes de um site, do mais novo para o mais antigo. */
export async function recentBuilds(
  db: Executor,
  siteId: string,
  limit = RECENT_BUILDS_LIMIT,
): Promise<RecentBuild[]> {
  return db
    .select({
      id: builds.id,
      status: builds.status,
      release: builds.release,
      versionId: builds.versionId,
      finishedAt: builds.finishedAt,
    })
    .from(builds)
    .where(eq(builds.siteId, siteId))
    .orderBy(desc(builds.finishedAt), desc(builds.id))
    .limit(limit);
}

/** "Publicar agora": o build do site roda já, sem esperar a janela. */
export async function requestBuildNow(
  tx: Executor,
  actor: Actor,
  siteId: string,
): Promise<Result<void>> {
  const allowed = requireRole(actor, 'operations.run');
  if (!allowed.ok) return allowed;
  const [site] = await tx.select({ state: sites.state }).from(sites).where(eq(sites.id, siteId));
  if (site === undefined) {
    return {
      ok: false,
      issues: [{ code: 'site.not_found', message: `Site ${siteId} não encontrado`, path: [] }],
    };
  }
  if (site.state === 'pausado') {
    return {
      ok: false,
      issues: [
        { code: 'site.paused', message: `O site ${siteId} está pausado; retome antes`, path: [] },
      ],
    };
  }
  await buildNow(tx, siteId);
  return { ok: true, value: undefined };
}

/** Versão já publicada que o site pode voltar a ter no ar ("Reverter"). */
export type RollbackVersion = {
  versionId: string;
  release: string;
  pages: number | null;
  /** Fim do build mais recente que publicou a versão. */
  finishedAt: Date;
};

const notFound = (siteId: string) => ({
  ok: false as const,
  issues: [{ code: 'site.not_found', message: `Site ${siteId} não encontrado`, path: [] }],
});

/** Versões dos builds `ok` do site, da mais recente para a mais antiga, sem a que está no ar. */
export async function listRollbackVersions(
  db: Executor,
  actor: Actor,
  siteId: string,
): Promise<Result<RollbackVersion[]>> {
  const allowed = requireRole(actor, 'operations.run');
  if (!allowed.ok) return allowed;
  const [site] = await db
    .select({ activeVersionId: sites.activeVersionId })
    .from(sites)
    .where(eq(sites.id, siteId));
  if (site === undefined) return notFound(siteId);

  const rows = await db
    .selectDistinctOn([builds.versionId], {
      versionId: builds.versionId,
      release: builds.release,
      pages: builds.pages,
      finishedAt: builds.finishedAt,
    })
    .from(builds)
    .where(and(eq(builds.siteId, siteId), eq(builds.status, 'ok'), isNotNull(builds.versionId)))
    .orderBy(builds.versionId, desc(builds.finishedAt), desc(builds.id));
  const versions = rows
    .filter(
      (row): row is RollbackVersion =>
        row.versionId !== null && row.versionId !== site.activeVersionId,
    )
    .sort((a, b) => b.finishedAt.getTime() - a.finishedAt.getTime());
  return { ok: true, value: versions };
}

/**
 * "Reverter": enfileira o rollback do site para uma versão de um build `ok` dele, diferente da
 * que está no ar. Não muda o estado nem a pausa; a task `rollback` grava a versão ativa quando
 * conclui.
 */
export async function requestRollback(
  tx: Executor,
  actor: Actor,
  siteId: string,
  versionId: string,
): Promise<Result<void>> {
  const allowed = requireRole(actor, 'operations.run');
  if (!allowed.ok) return allowed;
  const [site] = await tx
    .select({ activeVersionId: sites.activeVersionId })
    .from(sites)
    .where(eq(sites.id, siteId));
  if (site === undefined) return notFound(siteId);
  if (versionId === site.activeVersionId) {
    return {
      ok: false,
      issues: [
        {
          code: 'rollback.version_active',
          message: `A versão ${versionId} já está no ar`,
          path: ['versionId'],
        },
      ],
    };
  }
  const [published] = await tx
    .select({ id: builds.id })
    .from(builds)
    .where(and(eq(builds.siteId, siteId), eq(builds.status, 'ok'), eq(builds.versionId, versionId)))
    .limit(1);
  if (published === undefined) {
    return {
      ok: false,
      issues: [
        {
          code: 'rollback.version_unknown',
          message: `A versão ${versionId} não é de um build bem-sucedido de ${siteId}`,
          path: ['versionId'],
        },
      ],
    };
  }
  await scheduleRollback(tx, siteId, versionId);
  return { ok: true, value: undefined };
}
