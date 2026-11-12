import { and, eq, isNotNull, sql } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { builds, previewState } from '../../db/schema/index.ts';
import { PREVIEW_STATE_ID, type PREVIEW_STATUSES } from '../../db/schema/preview.ts';
import { compare, parse, type Version } from '../releases/next-version.ts';

// Prévia na versão corrente (workspace#84): a prévia segue a maior release que já foi ao ar
// com build ok em algum site. O fim de cada build ok pede a reconciliação (task
// `reconcile-preview`, do build-runner), que compara a versão corrente com o estado gravado
// aqui e troca o container. Tabela operacional de uma linha só, fora do snapshot.

export type PreviewStatus = (typeof PREVIEW_STATUSES)[number];

/**
 * Estado da prévia. Sem linha gravada, é `sem_versao` com tudo nulo (`updatedAt` inclusive).
 */
export type PreviewState = {
  status: PreviewStatus;
  currentRelease: string | null;
  targetRelease: string | null;
  failureReason: string | null;
  updatedAt: Date | null;
};

/** Troca do container da prévia para a versão corrente; só o build-runner registra esta task. */
export const RECONCILE_PREVIEW_TASK = 'reconcile-preview';

/**
 * Enfileira a reconciliação da prévia, na transação de quem pede. `job_key` único com
 * `replace`: há uma prévia só, e pedidos repetidos antes de o job rodar viram um só.
 */
export async function schedulePreviewReconcile(tx: Executor): Promise<void> {
  await tx.execute(sql`
    select graphile_worker.add_job(
      identifier => ${RECONCILE_PREVIEW_TASK},
      payload => '{}'::json,
      max_attempts => 5,
      job_key => 'preview',
      job_key_mode => 'replace'
    )`);
}

/**
 * Versão corrente: a maior release, em ordem numérica (1.10.0 > 1.9.0), com build `ok` em
 * algum site. Rollback não conta (só reaproveita a release do site); build falho ou cancelado
 * também não. Sem nenhum build ok, `null`.
 */
export async function currentPreviewRelease(db: Executor): Promise<string | null> {
  const rows = await db
    .selectDistinct({ release: builds.release })
    .from(builds)
    .where(and(eq(builds.kind, 'build'), eq(builds.status, 'ok'), isNotNull(builds.release)));
  let highest: { tag: string; version: Version } | undefined;
  for (const { release } of rows) {
    const version = release === null ? undefined : parse(release);
    if (release === null || version === undefined) continue;
    if (highest === undefined || compare(version, highest.version) > 0) {
      highest = { tag: release, version };
    }
  }
  return highest?.tag ?? null;
}

const STATE_COLUMNS = {
  status: previewState.status,
  currentRelease: previewState.currentRelease,
  targetRelease: previewState.targetRelease,
  failureReason: previewState.failureReason,
  updatedAt: previewState.updatedAt,
};

/** Estado gravado da prévia; sem linha, `sem_versao`. */
export async function readPreviewState(db: Executor): Promise<PreviewState> {
  const [row] = await db.select(STATE_COLUMNS).from(previewState);
  return (
    row ?? {
      status: 'sem_versao',
      currentRelease: null,
      targetRelease: null,
      failureReason: null,
      updatedAt: null,
    }
  );
}

type Fields = Pick<PreviewState, 'status' | 'currentRelease' | 'targetRelease' | 'failureReason'>;

async function upsert(db: Executor, fields: Partial<Fields>, initial: Fields): Promise<void> {
  const updatedAt = new Date();
  await db
    .insert(previewState)
    .values({ id: PREVIEW_STATE_ID, ...initial, updatedAt })
    .onConflictDoUpdate({ target: previewState.id, set: { ...fields, updatedAt } });
}

/**
 * Começa a troca para `target`: `atualizando`, de qualquer estado. A versão no ar continua a
 * mesma até a troca terminar.
 */
export async function startPreviewUpdate(db: Executor, target: string): Promise<void> {
  const fields = { status: 'atualizando', targetRelease: target, failureReason: null } as const;
  await upsert(db, fields, { ...fields, currentRelease: null });
}

/**
 * Transição a partir de `atualizando` para `target`; outro estado ou outro alvo (uma troca
 * mais nova começou) é recusado com `false`.
 */
async function finishUpdate(
  db: Executor,
  target: string,
  fields: Partial<Fields>,
): Promise<boolean> {
  const updated = await db
    .update(previewState)
    .set({ ...fields, updatedAt: new Date() })
    .where(
      and(
        eq(previewState.id, PREVIEW_STATE_ID),
        eq(previewState.status, 'atualizando'),
        eq(previewState.targetRelease, target),
      ),
    )
    .returning({ id: previewState.id });
  return updated.length > 0;
}

/** Troca concluída: `target` está no ar (`no_ar`). `false` se não havia troca para `target`. */
export function completePreviewUpdate(db: Executor, target: string): Promise<boolean> {
  return finishUpdate(db, target, {
    status: 'no_ar',
    currentRelease: target,
    targetRelease: null,
    failureReason: null,
  });
}

/**
 * Troca falhou: a versão atual continua no ar, e o estado guarda o alvo e o motivo (`falhou`).
 * `false` se não havia troca para `target`.
 */
export function failPreviewUpdate(db: Executor, target: string, reason: string): Promise<boolean> {
  return finishUpdate(db, target, { status: 'falhou', failureReason: reason });
}

/** Nenhuma release com build ok e nenhuma tag padrão: a prévia fica `sem_versao`. */
export async function markPreviewWithoutVersion(db: Executor): Promise<void> {
  const fields = {
    status: 'sem_versao',
    currentRelease: null,
    targetRelease: null,
    failureReason: null,
  } as const;
  await upsert(db, fields, fields);
}
