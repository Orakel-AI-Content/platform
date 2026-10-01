// Builds no banco (12.0, L3): o que o build-runner precisa antes de começar e o registro do
// resultado. Com sucesso, a mesma transação grava o build e baixa as mudanças pela lista
// que o snapshot viu; com falha permanente, pausa o site com o motivo.
import type { Result } from '@orakel/content-model';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { builds, pendingChanges, sites } from '../../db/schema/index.ts';
import { requireRole, type Actor } from '../access/rbac.ts';
import { currentConfig } from '../sites/sites.ts';
import type { BuildOutcome } from './run-build.ts';
import { buildNow } from './schedule.ts';
import { markPublished, pauseSite } from './site-state.ts';

export type BuildTarget = {
  siteId: string;
  state: (typeof sites.$inferSelect)['state'];
  pausedReason: string | null;
  /** Release registrada; nula até a primeira promoção. */
  release: string | null;
  /** Domínio principal da configuração corrente. */
  domain: string;
  /** Páginas da versão ativa (último build com sucesso): referência da trava. */
  activePages: number | undefined;
};

export async function loadBuildTarget(
  db: Executor,
  siteId: string,
): Promise<BuildTarget | undefined> {
  const [site] = await db.select().from(sites).where(eq(sites.id, siteId));
  if (site === undefined) return undefined;
  const config = await currentConfig(db, siteId);
  const [active] = await db
    .select({ pages: builds.pages })
    .from(builds)
    .where(and(eq(builds.siteId, siteId), eq(builds.status, 'ok')))
    .orderBy(desc(builds.finishedAt), desc(builds.id))
    .limit(1);
  return {
    siteId,
    state: site.state,
    pausedReason: site.pausedReason,
    release: site.release,
    domain: config?.domains[0] ?? '',
    activePages: active?.pages ?? undefined,
  };
}

export type BuildRun = {
  siteId: string;
  release: string;
  jobId: string | undefined;
  attempt: number;
  startedAt: Date;
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
    await pauseSite(tx, run.siteId, `${outcome.stage}: ${outcome.failure.message}`);
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
