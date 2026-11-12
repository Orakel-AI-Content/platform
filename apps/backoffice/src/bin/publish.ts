import { setTimeout as sleep } from 'node:timers/promises';

import { and, asc, eq } from 'drizzle-orm';

import { getDb, type Executor } from '../db/client.ts';
import { builds } from '../db/schema/index.ts';
import { SYSTEM_ACTOR } from '../domain/access/rbac.ts';
import { requestBuildNow } from '../domain/builds/builds.ts';
import { runProcess } from './run-process.ts';

/** Tentativas do job `build` (`max_attempts` em domain/builds/schedule.ts). */
export const BUILD_MAX_ATTEMPTS = 5;

/** O que o comando lê de cada tentativa do job. */
export type AttemptRow = Pick<
  typeof builds.$inferSelect,
  | 'attempt'
  | 'status'
  | 'currentStage'
  | 'failedStage'
  | 'failureKind'
  | 'failureMessage'
  | 'versionId'
  | 'release'
>;

export type Verdict =
  | { kind: 'waiting'; note: string }
  | { kind: 'ok'; versionId: string | null; release: string | null }
  | { kind: 'failed'; message: string };

function failureText(row: AttemptRow): string {
  const stage = row.failedStage ?? 'desconhecida';
  return `etapa ${stage}, tentativa ${row.attempt}: ${row.failureMessage ?? 'sem motivo gravado'}`;
}

/**
 * Situação do build a partir da tentativa mais recente do job: `ok` e falha final encerram;
 * falha transitória com tentativa restante espera a repetição, que nasce em outra linha.
 */
export function verdict(row: AttemptRow | undefined): Verdict {
  if (row === undefined) return { kind: 'waiting', note: 'aguardando a tentativa' };
  switch (row.status) {
    case 'na_fila':
      return { kind: 'waiting', note: `tentativa ${row.attempt} na fila` };
    case 'rodando':
      return {
        kind: 'waiting',
        note: `tentativa ${row.attempt} rodando (${row.currentStage ?? 'começando'})`,
      };
    case 'ok':
      return { kind: 'ok', versionId: row.versionId, release: row.release };
    case 'cancelado':
      return { kind: 'failed', message: `build cancelado na tentativa ${row.attempt}` };
    case 'failed':
      if (row.failureKind === 'transient' && row.attempt < BUILD_MAX_ATTEMPTS) {
        return { kind: 'waiting', note: `falha transitória (${failureText(row)}); vai repetir` };
      }
      return { kind: 'failed', message: `build falhou na ${failureText(row)}` };
  }
}

/** Pede o build já, como o "Publicar agora", e devolve o job da linha `na_fila` criada. */
async function requestBuild(tx: Executor, siteId: string): Promise<string> {
  const requested = await requestBuildNow(tx, SYSTEM_ACTOR, siteId);
  if (!requested.ok) throw new Error(requested.issues.map((issue) => issue.message).join('; '));
  const [row] = await tx
    .select({ jobId: builds.jobId })
    .from(builds)
    .where(and(eq(builds.siteId, siteId), eq(builds.kind, 'build'), eq(builds.status, 'na_fila')));
  if (row === undefined || row.jobId === null)
    throw new Error(`Build de ${siteId} não foi enfileirado`);
  return row.jobId;
}

async function latestAttempt(db: Executor, jobId: string): Promise<AttemptRow | undefined> {
  const rows = await db
    .select({
      attempt: builds.attempt,
      status: builds.status,
      currentStage: builds.currentStage,
      failedStage: builds.failedStage,
      failureKind: builds.failureKind,
      failureMessage: builds.failureMessage,
      versionId: builds.versionId,
      release: builds.release,
    })
    .from(builds)
    .where(eq(builds.jobId, jobId))
    .orderBy(asc(builds.attempt), asc(builds.id));
  return rows.at(-1);
}

const POLL_MS = 2000;
/** Limite de espera: cobre as cinco tentativas com o backoff do Graphile Worker. */
const TIMEOUT_MS = 20 * 60 * 1000;

// pnpm local:publish <site> (ADR 0026 da raiz): pede o build ao Backoffice, pela mesma fila
// do "Publicar agora", e espera o build-runner fechar a execução. Sai com código 1 e o motivo
// gravado no build quando ele falha; o build fica no histórico do site como qualquer outro.
if (import.meta.main) {
  await runProcess('backoffice-publish', async (logger) => {
    const siteId = process.argv[2];
    if (siteId === undefined) throw new Error('uso: pnpm local:publish <site>');
    const { pool, db } = getDb();
    try {
      const jobId = await db.transaction((tx) => requestBuild(tx, siteId));
      logger.info({ siteId, jobId }, `build de ${siteId} pedido; esperando o build-runner`);
      const deadline = Date.now() + TIMEOUT_MS;
      let last = '';
      for (;;) {
        const result = verdict(await latestAttempt(db, jobId));
        if (result.kind === 'failed') throw new Error(result.message);
        if (result.kind === 'ok') {
          logger.info(
            { siteId, jobId, versionId: result.versionId, release: result.release },
            `Publicado: https://${siteId}.localhost`,
          );
          return;
        }
        if (result.note !== last) logger.info({ siteId, jobId }, result.note);
        last = result.note;
        if (Date.now() > deadline) {
          throw new Error(`Build de ${siteId} não terminou em ${TIMEOUT_MS / 60000} min`);
        }
        await sleep(POLL_MS);
      }
    } finally {
      await pool.end();
    }
  });
}
