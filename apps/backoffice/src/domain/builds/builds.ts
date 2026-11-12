// Builds no banco (12.0, L3): o que o build-runner precisa antes de começar e o registro da
// execução. O pedido nasce `na_fila` no agendamento (schedule.ts), a tentativa o promove a
// `rodando` e a mesma linha é fechada com o resultado: com sucesso,
// a transação que a fecha baixa as mudanças pela lista que o snapshot viu; com falha
// permanente, pausa o site com o motivo. As consultas daqui só leem builds fechados. "Reverter" (L4) escolhe
// entre as versões dos builds `ok` e enfileira o rollback, que tem o mesmo ciclo de linhas
// (tipo rollback) e fica fora das consultas de build; "Desfazer última publicação" volta à versão
// que estava no ar antes da ativa, pela ordem das idas ao ar (builds e rollbacks `ok`).
import type { Result } from '@orakel/content-model';
import { and, desc, eq, inArray, isNotNull, isNull, ne } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import {
  builds,
  FINISHED_BUILD_STATUSES,
  OPEN_BUILD_STATUSES,
  pendingChanges,
  siteEvents,
  sites,
  type BuildKind,
  type BuildStatus,
  type FAILURE_KINDS,
  type SiteEventKind,
} from '../../db/schema/index.ts';
import { requireRole, SYSTEM_ACTOR, type Actor } from '../access/rbac.ts';
import { currentConfig } from '../sites/sites.ts';
import type { BuildOutcome, BuildStage } from './run-build.ts';
import type { RollbackOutcome } from './run-rollback.ts';
import {
  buildNow,
  recordQueuedBuild,
  removeQueuedBuildJob,
  scheduleRollback,
  type QueuedRun,
} from './schedule.ts';
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

/** Estado de um build que terminou de rodar. */
export type FinishedBuildStatus = (typeof FINISHED_BUILD_STATUSES)[number];

/** Só os builds que terminaram de rodar: fora as linhas abertas, canceladas e de rollback. */
const finishedBuild = and(
  eq(builds.kind, 'build'),
  inArray(builds.status, FINISHED_BUILD_STATUSES),
);
/** Só os builds que publicaram uma versão. */
const publishedBuild = and(eq(builds.kind, 'build'), eq(builds.status, 'ok'));

/** Estreita o tipo da linha que `finishedBuild` e `publishedBuild` já filtraram no banco. */
function isFinished<T extends { status: BuildStatus; finishedAt: Date | null }>(
  row: T,
): row is T & { status: FinishedBuildStatus; finishedAt: Date } {
  return (
    row.finishedAt !== null && (FINISHED_BUILD_STATUSES as readonly string[]).includes(row.status)
  );
}

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
    .where(and(eq(builds.siteId, siteId), publishedBuild, eq(builds.versionId, activeVersionId)))
    .orderBy(desc(builds.finishedAt), desc(builds.id))
    .limit(1);
  return row;
}

/** Quando a versão ativa entrou no ar e quem pediu (nulo no build sem autor, o da janela). */
export type ActiveSince = { at: Date; by: string | null };

/**
 * Quando a versão ativa entrou no ar (#647): a execução `ok` mais recente, build ou rollback,
 * com `versionId = sites.activeVersionId`. Depois de um "Reverter", é a reversão, não o build
 * que gerou a versão.
 */
export async function activeSince(
  db: Executor,
  siteId: string,
  activeVersionId: string | null,
): Promise<ActiveSince | undefined> {
  if (activeVersionId === null) return undefined;
  const [row] = await db
    .select({ at: builds.finishedAt, by: builds.requestedBy })
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
  return row?.at ? { at: row.at, by: row.by } : undefined;
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
  /** Tipo da execução; sem ele, build. */
  run?: QueuedRun;
};

/**
 * Abre a tentativa: promove a linha `na_fila` do job a `rodando`, com a release do plano. Sem
 * linha na fila (job enfileirado antes dela existir, ou tentativa devolvida por `recover.ts`),
 * grava a linha `rodando` direto. Roda fora da transação do resultado, para a linha ser vista
 * enquanto a execução acontece; se o processo morrer, a recuperação na partida a fecha. Vale
 * para o build e para o rollback.
 */
export async function startBuild(db: Executor, run: BuildRun): Promise<number> {
  const queued = run.run ?? { kind: 'build' as const };
  const opened = {
    release: run.release,
    attempt: run.attempt,
    status: 'rodando' as const,
    startedAt: run.startedAt,
  };
  if (run.jobId !== undefined) {
    const [promoted] = await db
      .update(builds)
      .set(opened)
      .where(queuedRow(run.jobId))
      .returning({ id: builds.id });
    if (promoted !== undefined) return promoted.id;
  }
  const [row] = await db
    .insert(builds)
    .values({
      ...opened,
      siteId: run.siteId,
      kind: queued.kind,
      jobId: run.jobId ?? null,
      ...(queued.kind === 'rollback' && { versionId: queued.versionId }),
    })
    .returning({ id: builds.id });
  if (row === undefined) throw new Error(`Execução de ${run.siteId} não foi registrada`);
  return row.id;
}

/**
 * Etapa em andamento da tentativa (image, render, publish), gravada a cada troca enquanto a
 * linha está `rodando`, para o status ao vivo. Linha já fechada não muda.
 */
export async function setCurrentStage(
  db: Executor,
  buildId: number,
  stage: BuildStage,
): Promise<void> {
  await db
    .update(builds)
    .set({ currentStage: stage })
    .where(and(eq(builds.id, buildId), eq(builds.status, 'rodando')));
}

/**
 * A tentativa `rodando` tem pedido de cancelamento ("Cancelar", gravado por `cancelBuild`)? O
 * build-runner consulta durante a execução para matar o container e fechar a linha `cancelado`.
 */
export async function buildCancelRequested(db: Executor, buildId: number): Promise<boolean> {
  const [row] = await db
    .select({ at: builds.cancelRequestedAt })
    .from(builds)
    .where(and(eq(builds.id, buildId), eq(builds.status, 'rodando')));
  return row?.at != null;
}

/**
 * A linha `na_fila` do job, de build ou de rollback: o id do job é único entre as tasks e o
 * índice `builds_queued_job_unique` garante uma só.
 */
function queuedRow(jobId: string) {
  return and(eq(builds.jobId, jobId), eq(builds.status, 'na_fila'));
}

/** Job ignorado (site pausado ou inexistente): a linha `na_fila` dele fecha como `cancelado`. */
export async function cancelQueuedBuild(db: Executor, jobId: string): Promise<void> {
  await db
    .update(builds)
    .set({ status: 'cancelado', finishedAt: new Date() })
    .where(queuedRow(jobId));
}

/**
 * Depois de uma falha transitória que o Graphile Worker vai repetir: a próxima tentativa nasce
 * `na_fila`, no horário da repetição e em nome de quem pediu a que falhou.
 */
export async function queueRetry(tx: Executor, buildId: number, runAt: Date): Promise<void> {
  const [failed] = await tx
    .select({
      siteId: builds.siteId,
      jobId: builds.jobId,
      attempt: builds.attempt,
      requestedBy: builds.requestedBy,
      kind: builds.kind,
      versionId: builds.versionId,
    })
    .from(builds)
    .where(eq(builds.id, buildId));
  if (failed === undefined || failed.jobId === null) return;
  // A linha de rollback guarda a versão de destino desde a fila, e a falha não a apaga.
  const run: QueuedRun =
    failed.kind === 'rollback' && failed.versionId !== null
      ? { kind: 'rollback', versionId: failed.versionId }
      : { kind: 'build' };
  await recordQueuedBuild(
    tx,
    failed.siteId,
    { id: failed.jobId, attempts: failed.attempt, runAt },
    failed.requestedBy ?? SYSTEM_ACTOR.email,
    { replaceRequester: false, run },
  );
}

/**
 * Fecha a linha `rodando` da tentativa de rollback com o resultado. Com sucesso, a versão
 * ativada passa a ser a ativa do site, na mesma transação; com falha, a linha guarda o tipo e
 * a mensagem (sem etapa: o rollback é um único container) e o fim do log do container, e o
 * site não é pausado.
 */
export async function recordRollback(
  tx: Executor,
  run: { buildId: number; siteId: string },
  outcome: RollbackOutcome,
): Promise<void> {
  const result =
    outcome.status === 'ok'
      ? { status: 'ok' as const, versionId: outcome.rollback.versionId }
      : {
          status: 'failed' as const,
          failedStage: null,
          failureKind: outcome.failure.kind,
          failureMessage: outcome.failure.message,
          logTail: outcome.logTail ?? null,
        };
  const closed = await tx
    .update(builds)
    .set({ ...result, finishedAt: new Date() })
    .where(
      and(eq(builds.id, run.buildId), eq(builds.kind, 'rollback'), eq(builds.status, 'rodando')),
    )
    .returning({ id: builds.id });
  if (closed.length === 0) {
    throw new Error(`Rollback ${run.buildId} de ${run.siteId} não está rodando: nada a fechar`);
  }
  if (outcome.status === 'ok') await setActiveVersion(tx, run.siteId, outcome.rollback.versionId);
}

export type BuildClosing = {
  /** Linha `rodando` aberta por `startBuild`. */
  buildId: number;
  siteId: string;
  /** Declaração de despublicação em massa que o plano usou; o sucesso a consome. */
  massUnpublishDeclaredAt?: Date | null;
};

/** Colunas que fecham a linha, conforme o desfecho da tentativa. */
function closingFields(outcome: BuildOutcome) {
  switch (outcome.status) {
    case 'ok':
      return {
        status: 'ok' as const,
        pendingChangeIds: outcome.render.pendingChangeIds,
        pages: outcome.render.pages,
        files: outcome.render.files,
        versionId: outcome.publish.versionId,
        cacheKey: outcome.publish.cacheKey,
        renderMs: outcome.renderMs,
        publishMs: outcome.publishMs,
      };
    case 'cancelled':
      return {
        status: 'cancelado' as const,
        pages: outcome.render?.pages ?? null,
        files: outcome.render?.files ?? null,
        renderMs: outcome.renderMs ?? null,
        publishMs: outcome.publishMs ?? null,
      };
    case 'failed':
      return {
        status: 'failed' as const,
        failedStage: outcome.stage,
        failureKind: outcome.failure.kind,
        failureMessage: outcome.failure.message,
        logTail: outcome.logTail ?? null,
        pendingChangeIds: outcome.render?.pendingChangeIds ?? [],
        pages: outcome.render?.pages ?? null,
        files: outcome.render?.files ?? null,
        renderMs: outcome.renderMs ?? null,
        publishMs: outcome.publishMs ?? null,
      };
  }
}

/**
 * Fecha a linha da tentativa com o resultado e aplica o efeito no site e nas mudanças pendentes.
 * A cancelada fecha `cancelado`, sem efeito: o site não é pausado e as mudanças continuam
 * pendentes; quem pediu e quando já estão na linha (`cancelBuild`).
 */
export async function recordBuild(
  tx: Executor,
  run: BuildClosing,
  outcome: BuildOutcome,
): Promise<number> {
  const result = closingFields(outcome);
  const closed = await tx
    .update(builds)
    .set({ ...result, finishedAt: new Date() })
    .where(and(eq(builds.id, run.buildId), eq(builds.status, 'rodando')))
    .returning({ id: builds.id });
  if (closed.length === 0) {
    throw new Error(`Build ${run.buildId} de ${run.siteId} não está rodando: nada a fechar`);
  }

  if (outcome.status === 'ok') {
    const ids = outcome.render.pendingChangeIds;
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
  } else if (outcome.status === 'failed' && outcome.failure.kind === 'permanent') {
    await pauseSite(
      tx,
      run.siteId,
      `${outcome.stage}: ${outcome.failure.message}`,
      outcome.failure.culprit,
    );
  }
  return run.buildId;
}

export type LastBuild = {
  status: FinishedBuildStatus;
  versionId: string | null;
  finishedAt: Date;
};

/** Último build terminado de cada site, para o Registro de instâncias. */
export async function lastBuilds(db: Executor): Promise<Map<string, LastBuild>> {
  const rows = await db
    .selectDistinctOn([builds.siteId], {
      siteId: builds.siteId,
      status: builds.status,
      versionId: builds.versionId,
      finishedAt: builds.finishedAt,
    })
    .from(builds)
    .where(finishedBuild)
    .orderBy(builds.siteId, desc(builds.finishedAt), desc(builds.id));
  return new Map(rows.filter(isFinished).map(({ siteId, ...last }) => [siteId, last]));
}

/** Um dos últimos builds de um site, como o resumo da página do site os mostra. */
export type RecentBuild = LastBuild & { id: number; release: string };

/** Quantos builds o resumo do site mostra. */
export const RECENT_BUILDS_LIMIT = 5;

/** Os builds terminados mais recentes de um site, do mais novo para o mais antigo. */
export async function recentBuilds(
  db: Executor,
  siteId: string,
  limit = RECENT_BUILDS_LIMIT,
): Promise<RecentBuild[]> {
  const rows = await db
    .select({
      id: builds.id,
      status: builds.status,
      release: builds.release,
      versionId: builds.versionId,
      finishedAt: builds.finishedAt,
    })
    .from(builds)
    .where(and(eq(builds.siteId, siteId), finishedBuild))
    .orderBy(desc(builds.finishedAt), desc(builds.id))
    .limit(limit);
  // Linha fechada sempre passou por `rodando`, que grava a release: a nula é só a `na_fila`.
  return rows
    .filter(isFinished)
    .flatMap(({ release, ...row }) => (release === null ? [] : [{ ...row, release }]));
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
  await buildNow(tx, siteId, actor.email);
  return { ok: true, value: undefined };
}

const notFound = (siteId: string) => ({
  ok: false as const,
  issues: [{ code: 'site.not_found', message: `Site ${siteId} não encontrado`, path: [] }],
});

type OpenBuildStatus = (typeof OPEN_BUILD_STATUSES)[number];
type ClosedBuildStatus = Exclude<BuildStatus, OpenBuildStatus>;

function isOpenStatus(status: BuildStatus): status is OpenBuildStatus {
  return (OPEN_BUILD_STATUSES as readonly BuildStatus[]).includes(status);
}

/** Execução em andamento ou na fila do site (build ou rollback), para o status ao vivo. */
export type OpenExecution = {
  id: number;
  kind: BuildKind;
  status: OpenBuildStatus;
  /** Etapa em andamento, enquanto `rodando`. */
  currentStage: BuildStage | null;
  /** Horário previsto para começar, enquanto `na_fila`. */
  scheduledFor: Date | null;
  startedAt: Date | null;
  requestedBy: string | null;
  /** Pedido de cancelamento que o build-runner ainda não atendeu. */
  cancelRequestedAt: Date | null;
};

/** Detalhe de uma execução que falhou. */
export type ExecutionFailure = {
  /** Etapa em que falhou; nula no rollback, que é um container só. */
  stage: BuildStage | null;
  kind: (typeof FAILURE_KINDS)[number] | null;
  message: string | null;
  /** Trecho final do log do container. */
  logTail: string | null;
};

/** Item do histórico: uma execução que terminou (uma linha por tentativa, ADR 0008). */
export type ExecutionHistoryItem = {
  type: 'execucao';
  id: number;
  kind: BuildKind;
  status: ClosedBuildStatus;
  requestedBy: string | null;
  /** Quem cancelou, no `cancelado` pedido por alguém. */
  cancelRequestedBy: string | null;
  /** Fim da execução. */
  at: Date;
  release: string | null;
  versionId: string | null;
  /** Só no `failed`. */
  failure: ExecutionFailure | null;
};

/** Item do histórico: pausa, retomada ou troca de versão do site-builder. */
export type EventHistoryItem = {
  type: 'evento';
  id: number;
  kind: SiteEventKind;
  requestedBy: string;
  at: Date;
  /** Motivo da pausa. */
  reason: string | null;
  /** Troca de versão: release anterior e nova. */
  previousRelease: string | null;
  release: string | null;
};

export type SiteHistoryItem = ExecutionHistoryItem | EventHistoryItem;

/** O que está acontecendo no site e o que já aconteceu, do mais recente ao mais antigo. */
export type SiteActivity = {
  open: OpenExecution | null;
  history: SiteHistoryItem[];
};

/** Quantos itens o histórico do site traz (sem paginação). */
export const SITE_HISTORY_LIMIT = 50;

/**
 * Atividade do site, para o status ao vivo e o histórico da página do site: a execução aberta
 * (a `rodando` antes da `na_fila`, quando um pedido durante o build deixa as duas) e o
 * histórico que une as execuções terminadas de `builds` (builds e rollbacks, inclusive
 * cancelados) aos eventos de `site_events`. Cada tabela é lida até o limite, e as duas listas
 * são intercaladas pelo horário e cortadas no limite. A execução aberta fica fora do histórico.
 * Exige só `site.read`: a aba "Publicação" (#647) aparece para todos os perfis, como a "Builds" que ela
 * substitui (#637), inclusive a mensagem e o fim do log das falhas.
 */
export async function siteActivity(
  db: Executor,
  actor: Actor,
  siteId: string,
  limit = SITE_HISTORY_LIMIT,
): Promise<Result<SiteActivity>> {
  const allowed = requireRole(actor, 'site.read');
  if (!allowed.ok) return allowed;
  const [site] = await db.select({ id: sites.id }).from(sites).where(eq(sites.id, siteId));
  if (site === undefined) return notFound(siteId);

  const openRows = await db
    .select({
      id: builds.id,
      kind: builds.kind,
      status: builds.status,
      currentStage: builds.currentStage,
      scheduledFor: builds.scheduledFor,
      startedAt: builds.startedAt,
      requestedBy: builds.requestedBy,
      cancelRequestedAt: builds.cancelRequestedAt,
    })
    .from(builds)
    .where(and(eq(builds.siteId, siteId), inArray(builds.status, OPEN_BUILD_STATUSES)))
    .orderBy(desc(builds.id));
  const opened = openRows.flatMap(({ status, ...row }) =>
    isOpenStatus(status) ? [{ ...row, status }] : [],
  );
  const open =
    opened.find((row) => row.status === 'rodando') ??
    opened.find((row) => row.status === 'na_fila') ??
    null;

  const executions = await db
    .select()
    .from(builds)
    .where(and(eq(builds.siteId, siteId), isNotNull(builds.finishedAt)))
    .orderBy(desc(builds.finishedAt), desc(builds.id))
    .limit(limit);
  const events = await db
    .select()
    .from(siteEvents)
    .where(eq(siteEvents.siteId, siteId))
    .orderBy(desc(siteEvents.createdAt), desc(siteEvents.id))
    .limit(limit);

  const history: SiteHistoryItem[] = [
    ...executions.flatMap(({ status, finishedAt, ...row }): ExecutionHistoryItem[] =>
      finishedAt === null || isOpenStatus(status)
        ? []
        : [
            {
              type: 'execucao',
              id: row.id,
              kind: row.kind,
              status,
              requestedBy: row.requestedBy,
              cancelRequestedBy: row.cancelRequestedBy,
              at: finishedAt,
              release: row.release,
              versionId: row.versionId,
              failure:
                status === 'failed'
                  ? {
                      stage: row.failedStage,
                      kind: row.failureKind,
                      message: row.failureMessage,
                      logTail: row.logTail,
                    }
                  : null,
            },
          ],
    ),
    ...events.map((row): EventHistoryItem => ({
      type: 'evento',
      id: row.id,
      kind: row.kind,
      requestedBy: row.requestedBy,
      at: row.createdAt,
      reason: row.reason,
      previousRelease: row.previousRelease,
      release: row.release,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, limit);

  return { ok: true, value: { open, history } };
}

/**
 * Desfecho do "Cancelar": `cancelado` quando a publicação estava na fila e saiu dela;
 * `pedido` quando já rodava e o pedido ficou marcado na linha, para o build-runner agir.
 */
export type BuildCancellation = 'cancelado' | 'pedido';

/**
 * "Cancelar" a publicação aberta do site. Na fila (job livre): tira o job da fila e fecha a
 * linha `cancelado`, com quem e quando. Rodando (ou job já pego pelo build-runner): só grava
 * quem e quando na linha, que continua aberta. Com uma `rodando` e outra `na_fila` (pedido
 * durante o build), age na da fila. Não é falha: não pausa o site nem baixa mudanças
 * pendentes, e o próximo agendamento abre outra linha `na_fila`. Reversão não é cancelável.
 */
export async function cancelBuild(
  tx: Executor,
  actor: Actor,
  siteId: string,
  now: Date = new Date(),
): Promise<Result<BuildCancellation>> {
  const allowed = requireRole(actor, 'operations.run');
  if (!allowed.ok) return allowed;
  const [site] = await tx.select({ id: sites.id }).from(sites).where(eq(sites.id, siteId));
  if (site === undefined) return notFound(siteId);

  const open = await tx
    .select({ id: builds.id, status: builds.status, jobId: builds.jobId })
    .from(builds)
    .where(
      and(
        eq(builds.siteId, siteId),
        eq(builds.kind, 'build'),
        inArray(builds.status, OPEN_BUILD_STATUSES),
      ),
    )
    .orderBy(builds.id)
    .for('update');
  const row = open.find((r) => r.status === 'na_fila') ?? open.find((r) => r.status === 'rodando');
  if (row === undefined) {
    return {
      ok: false,
      issues: [
        {
          code: 'build.not_open',
          message: `O site ${siteId} não tem publicação na fila nem em andamento`,
          path: [],
        },
      ],
    };
  }

  const request = { cancelRequestedBy: actor.email, cancelRequestedAt: now };
  const removed =
    row.status === 'na_fila' &&
    (row.jobId === null || (await removeQueuedBuildJob(tx, siteId, row.jobId)));
  if (removed) {
    await tx
      .update(builds)
      .set({ ...request, status: 'cancelado', finishedAt: now })
      .where(eq(builds.id, row.id));
    return { ok: true, value: 'cancelado' };
  }
  await tx.update(builds).set(request).where(eq(builds.id, row.id));
  return { ok: true, value: 'pedido' };
}

/** Versão já publicada que o site pode voltar a ter no ar ("Reverter"). */
export type RollbackVersion = {
  versionId: string;
  release: string;
  pages: number | null;
  /** Fim do build mais recente que publicou a versão. */
  finishedAt: Date;
};

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
    .where(and(eq(builds.siteId, siteId), publishedBuild, isNotNull(builds.versionId)))
    .orderBy(builds.versionId, desc(builds.finishedAt), desc(builds.id));
  const versions = rows
    .filter(
      (row): row is RollbackVersion =>
        row.versionId !== null &&
        row.release !== null &&
        row.finishedAt !== null &&
        row.versionId !== site.activeVersionId,
    )
    .sort((a, b) => b.finishedAt.getTime() - a.finishedAt.getTime());
  return { ok: true, value: versions };
}

/**
 * Versão que estava no ar imediatamente antes da ativa: a da ida ao ar mais recente (build ou
 * rollback `ok`, pela ordem em que terminaram) com outra versão. Contar os rollbacks é o que
 * faz o desfazer de um desfazer voltar à versão que acabou de sair do ar, e não a uma mais
 * antiga. Os dados vêm do build mais recente que publicou a versão, como no "Reverter".
 */
async function resolvePreviousVersion(
  db: Executor,
  siteId: string,
  activeVersionId: string | null,
): Promise<RollbackVersion | null> {
  if (activeVersionId === null) return null;
  // Sem filtro de tipo: build e rollback `ok` são as idas ao ar.
  const [previous] = await db
    .select({ versionId: builds.versionId })
    .from(builds)
    .where(
      and(
        eq(builds.siteId, siteId),
        eq(builds.status, 'ok'),
        isNotNull(builds.versionId),
        ne(builds.versionId, activeVersionId),
      ),
    )
    .orderBy(desc(builds.finishedAt), desc(builds.id))
    .limit(1);
  if (previous?.versionId == null) return null;
  const [published] = await db
    .select({ release: builds.release, pages: builds.pages, finishedAt: builds.finishedAt })
    .from(builds)
    .where(and(eq(builds.siteId, siteId), publishedBuild, eq(builds.versionId, previous.versionId)))
    .orderBy(desc(builds.finishedAt), desc(builds.id))
    .limit(1);
  if (published === undefined || published.release === null || published.finishedAt === null) {
    return null;
  }
  return {
    versionId: previous.versionId,
    release: published.release,
    pages: published.pages,
    finishedAt: published.finishedAt,
  };
}

/**
 * Destino do "Desfazer última publicação": a versão que estava no ar imediatamente antes da
 * ativa, ou `null` quando o site não tem uma.
 */
export async function previousVersion(
  db: Executor,
  actor: Actor,
  siteId: string,
): Promise<Result<RollbackVersion | null>> {
  const allowed = requireRole(actor, 'operations.run');
  if (!allowed.ok) return allowed;
  const [site] = await db
    .select({ activeVersionId: sites.activeVersionId })
    .from(sites)
    .where(eq(sites.id, siteId));
  if (site === undefined) return notFound(siteId);
  return { ok: true, value: await resolvePreviousVersion(db, siteId, site.activeVersionId) };
}

/**
 * "Desfazer última publicação": enfileira o rollback para a versão que estava no ar antes da
 * ativa, sem receber a versão de quem chama. Sem versão anterior, recusa e não enfileira nada;
 * com ela, as regras e o enfileiramento são os do "Reverter" (`requestRollback`).
 */
export async function requestUndoLastPublish(
  tx: Executor,
  actor: Actor,
  siteId: string,
): Promise<Result<RollbackVersion>> {
  const previous = await previousVersion(tx, actor, siteId);
  if (!previous.ok) return previous;
  if (previous.value === null) {
    return {
      ok: false,
      issues: [
        {
          code: 'rollback.no_previous',
          message: `O site ${siteId} não tem versão anterior publicada para voltar`,
          path: [],
        },
      ],
    };
  }
  const requested = await requestRollback(tx, actor, siteId, previous.value.versionId);
  if (!requested.ok) return requested;
  return { ok: true, value: previous.value };
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
    .where(and(eq(builds.siteId, siteId), publishedBuild, eq(builds.versionId, versionId)))
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
  await scheduleRollback(tx, siteId, versionId, actor.email);
  return { ok: true, value: undefined };
}
