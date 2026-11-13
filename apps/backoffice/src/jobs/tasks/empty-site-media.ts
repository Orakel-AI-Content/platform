import type { Task } from 'graphile-worker';

import type { Db } from '../../db/client.ts';
import { finishInfraRun, loadInfraRun, recordInfraStep } from '../../domain/infra/runs.ts';
import { scheduleInfraApply } from '../../domain/infra/schedule.ts';
import { ORIGINALS_BUCKET, type ObjectStore } from '../../domain/media/store.ts';
import { EMPTY_SITE_MEDIA_TASK, mediaBucket } from '../../domain/media/variants.ts';
import { infraPayloadOf } from './infra-run.ts';

export type EmptySiteMediaTaskDeps = { db: Db; store: ObjectStore };

/** Desfecho do esvaziamento: os objetos removidos, ou o motivo da falha. */
export type EmptySiteMediaOutcome =
  { ok: true; bucket: string; removed: number } | { ok: false; message: string };

/**
 * Esvazia `media-<site>`. Bucket inexistente ou vazio é sucesso (o elo é idempotente). Nunca toca
 * em `media-originals`, nem com o site `originals`. Sobrou objeto (gravação concorrente)? Falha.
 */
export async function emptySiteMedia(
  store: ObjectStore,
  siteId: string,
): Promise<EmptySiteMediaOutcome> {
  const bucket = mediaBucket(siteId);
  if (bucket === ORIGINALS_BUCKET) {
    return { ok: false, message: `Esvaziamento recusado: ${bucket} é o bucket dos originais` };
  }
  const keys = await store.list(bucket);
  await store.deleteMany(bucket, keys);
  const left = await store.list(bucket);
  if (left.length > 0) {
    return {
      ok: false,
      message: `${bucket} ainda tem ${left.length} objetos depois do esvaziamento`,
    };
  }
  return { ok: true, bucket, removed: keys.length };
}

/**
 * Elo 2 da remoção da infra (workspace#97), no backoffice-worker: só ele tem as credenciais S3 da
 * mídia. Com a remoção ainda em `aplicando` (etapa `imagens`, gravada pelo elo 1), esvazia o
 * bucket e, no sucesso, enfileira o apply do plano de destruição no build-runner, na mesma
 * transação em que confere a etapa. Na falha, ou em erro inesperado, fecha `falhou` em `imagens`
 * e a cadeia para (o job não se repete; "Tentar de novo" é uma execução nova).
 */
export function createEmptySiteMediaTask(deps: EmptySiteMediaTaskDeps): Task {
  return async (payload, helpers) => {
    const { siteId, runId } = infraPayloadOf(payload, EMPTY_SITE_MEDIA_TASK);
    const log = helpers.logger;
    const run = await loadInfraRun(deps.db, runId);
    if (run?.siteId !== siteId || run.kind !== 'remover' || run.status !== 'aplicando') {
      log.warn(
        `esvaziamento ${runId} de ${siteId} ignorado: execução em ${run?.status ?? '(nenhuma)'}`,
      );
      return;
    }
    const fail = async (message: string) => {
      log.error(`esvaziamento da mídia de ${siteId} falhou: ${message}`);
      const closed = await deps.db.transaction((tx) =>
        finishInfraRun(tx, runId, { status: 'falhou', step: 'imagens', message }),
      );
      if (!closed.ok) log.error(`execução ${runId} não fechada: ${JSON.stringify(closed.issues)}`);
    };

    try {
      const outcome = await emptySiteMedia(deps.store, siteId);
      if (!outcome.ok) return await fail(outcome.message);
      log.info(`${outcome.bucket} esvaziado: ${outcome.removed} objetos removidos`);

      const next = await deps.db.transaction(async (tx) => {
        const recorded = await recordInfraStep(tx, runId, 'imagens');
        if (recorded.ok) await scheduleInfraApply(tx, { siteId, runId });
        return recorded;
      });
      if (!next.ok) log.warn(`execução ${runId} já não aplica: destroy não enfileirado`);
    } catch (error) {
      await fail(
        `Erro inesperado ao esvaziar a mídia: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
}
