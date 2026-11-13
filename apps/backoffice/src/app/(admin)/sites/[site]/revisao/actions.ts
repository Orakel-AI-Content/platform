'use server';

import type { Issue, Result } from '@orakel/content-model';
import { revalidatePath } from 'next/cache';

import { currentActor } from '@/auth/request-actor.ts';
import type { ContentFormResult } from '@/components/contents/contentEditorValues.ts';
import type { SchemaFormIssue } from '@/components/forms/SchemaForm';
import type { FormActionResult } from '@/components/shared/actionResult.ts';
import { formatDateTime } from '@/components/shared/siteLabels.ts';
import { getDb, type Executor } from '@/db/client.ts';
import type { Actor } from '@/domain/access/rbac.ts';
import { amendInReview, nextInReviewQueue, type ContentEdit } from '@/domain/content/contents.ts';
import { PUBLISH_DAY_TIME_ZONE } from '@/domain/publications/publish.ts';
import { setAllConfirmations, setConfirmation } from '@/domain/reviews/confirmations.ts';
import {
  approveAndPublish,
  approveAndPublishBatch,
  approveAndSchedule,
  approveVersion,
  returnVersion,
  type ApprovalOutcome,
  type BatchItem,
} from '@/domain/reviews/reviews.ts';
import { resourcesFor } from '@/domain/sites/sites.ts';

import { noSession, refused } from '../content-form-result.ts';

// Ações da tela de revisão (#75, #598, #749, #751, workspace#89): permissão, confirmações,
// comentário, validação da release, limite diário e transbordo ficam no domínio
// (confirmations.ts, approveVersion, approveAndPublish, approveAndSchedule, returnVersion,
// amendInReview); aqui só a tradução do Result para o painel. As quatro decisões devolvem
// também o próximo da fila (`nextInReviewQueue`, workspace#90), lido na mesma transação. O
// lote da fila (#776) delega a `approveAndPublishBatch` e devolve o desfecho de cada artigo.

export type ApproveResult = FormActionResult<SchemaFormIssue>;

/**
 * Desfecho de uma decisão (aprovar, publicar, agendar ou devolver): a mensagem de sucesso, o
 * aviso (`warning`) quando o dia pedido estava cheio e a publicação foi para a próxima vaga, e o
 * próximo conteúdo da fila (`next`), ou `null` com a fila vazia.
 */
export type DecisionResult =
  | { ok: true; message: string; warning?: string; next: number | null }
  | Extract<ApproveResult, { ok: false }>;

/** Marcação gravada: as chaves confirmadas na versão depois dela, ou a recusa. */
export type ConfirmResult = { ok: true; confirmed: string[] } | { ok: false; message: string };

const INVALID_SESSION = 'Sessão inválida; entre de novo.';

/** Marca (`confirmed`) ou desmarca uma confirmação do checklist na versão que o revisor vê. */
export async function confirmAction(
  siteId: string,
  contentId: number,
  version: number,
  key: string,
  confirmed: boolean,
): Promise<ConfirmResult> {
  const actor = await currentActor();
  if (!actor.ok) return { ok: false, message: INVALID_SESSION };
  const result = await getDb().db.transaction((tx) =>
    setConfirmation(tx, actor.value, siteId, contentId, version, key, confirmed),
  );
  return confirmResult(siteId, contentId, result);
}

/** Marca ou desmarca todas as confirmações do checklist de uma vez. */
export async function confirmAllAction(
  siteId: string,
  contentId: number,
  version: number,
  confirmed: boolean,
): Promise<ConfirmResult> {
  const actor = await currentActor();
  if (!actor.ok) return { ok: false, message: INVALID_SESSION };
  const result = await getDb().db.transaction((tx) =>
    setAllConfirmations(tx, actor.value, siteId, contentId, version, confirmed),
  );
  return confirmResult(siteId, contentId, result);
}

function confirmResult(
  siteId: string,
  contentId: number,
  result: Awaited<ReturnType<typeof setConfirmation>>,
): ConfirmResult {
  if (!result.ok) {
    return { ok: false, message: result.issues.map((issue) => issue.message).join(' ') };
  }
  revalidatePath(`/sites/${siteId}/revisao/${contentId}`);
  return { ok: true, confirmed: result.value.confirmed };
}

/**
 * Aprova a versão que o revisor viu. As confirmações já estão gravadas, a cada marcação do
 * painel (#752); a aprovação as lê do banco (#749).
 */
export async function approveAction(
  siteId: string,
  contentId: number,
  version: number,
): Promise<DecisionResult> {
  const actor = await currentActor();
  if (!actor.ok) {
    return {
      ok: false,
      message: INVALID_SESSION,
      issues: [{ path: [], message: INVALID_SESSION }],
    };
  }
  const result = await withNext(actor.value, siteId, contentId, (tx) =>
    approveVersion(tx, actor.value, siteId, contentId, version),
  );
  if (!result.ok) {
    // O checklist é um campo só no domínio; no formulário, o resumo acima dos itens.
    return {
      ok: false,
      message: 'Não foi possível aprovar.',
      issues: result.issues.map((issue) => ({ path: [], message: issue.message })),
    };
  }
  revalidateReview(siteId, contentId);
  return { ok: true, message: `Versão ${version} aprovada.`, next: result.value.next };
}

/** Aprova a versão que o revisor viu e a publica na hora (ou na próxima vaga, com o dia cheio). */
export async function approvePublishAction(
  siteId: string,
  contentId: number,
  version: number,
): Promise<DecisionResult> {
  return decide(siteId, contentId, version, (tx, actor) =>
    approveAndPublish(tx, actor, siteId, contentId, version),
  );
}

/** Aprova a versão que o revisor viu e a agenda para `at` (ISO), ou para a próxima vaga. */
export async function approveScheduleAction(
  siteId: string,
  contentId: number,
  version: number,
  at: string,
): Promise<DecisionResult> {
  return decide(siteId, contentId, version, (tx, actor) =>
    approveAndSchedule(tx, actor, siteId, contentId, version, new Date(at)),
  );
}

/** Recusa que desfaz a transação da decisão; volta como `Result` em `withNext`. */
class DecisionRefused extends Error {
  readonly issues: Issue[];
  constructor(issues: Issue[]) {
    super('Decisão recusada');
    this.issues = issues;
  }
}

/**
 * Roda a decisão e, na mesma transação, lê o próximo da fila sem o conteúdo decidido. A recusa
 * da decisão volta como veio; a do próximo desfaz a decisão.
 */
async function withNext<T>(
  actor: Actor,
  siteId: string,
  contentId: number,
  run: (tx: Executor) => Promise<Result<T>>,
): Promise<Result<{ outcome: T; next: number | null }>> {
  try {
    return await getDb().db.transaction(async (tx) => {
      const result = await run(tx);
      if (!result.ok) return result;
      const next = await nextInReviewQueue(tx, actor, siteId, contentId);
      if (!next.ok) throw new DecisionRefused(next.issues);
      return { ok: true as const, value: { outcome: result.value, next: next.value } };
    });
  } catch (error) {
    if (error instanceof DecisionRefused) return { ok: false, issues: error.issues };
    throw error;
  }
}

async function decide(
  siteId: string,
  contentId: number,
  version: number,
  run: (tx: Executor, actor: Actor) => Promise<Result<ApprovalOutcome>>,
): Promise<DecisionResult> {
  const actor = await currentActor();
  if (!actor.ok) {
    return {
      ok: false,
      message: INVALID_SESSION,
      issues: [{ path: [], message: INVALID_SESSION }],
    };
  }
  const result = await withNext(actor.value, siteId, contentId, (tx) => run(tx, actor.value));
  if (!result.ok) {
    // Recusa da aprovação ou da publicação: tudo foi desfeito; no formulário, o resumo.
    return {
      ok: false,
      message: 'Não foi possível aprovar.',
      issues: result.issues.map((issue) => ({ path: [], message: issue.message })),
    };
  }
  revalidateReview(siteId, contentId);
  return { ok: true, ...decisionMessage(version, result.value.outcome), next: result.value.next };
}

/** "Foi ao ar" ou "agendado para <data e hora de São Paulo>", com o aviso do transbordo. */
function decisionMessage(
  version: number,
  outcome: ApprovalOutcome,
): { message: string; warning?: string } {
  const message =
    outcome.outcome === 'published'
      ? `Versão ${version} aprovada: o artigo foi ao ar.`
      : `Versão ${version} aprovada: o artigo foi agendado para ${formatDateTime(outcome.at, PUBLISH_DAY_TIME_ZONE)}.`;
  if (!outcome.overflowed) return { message };
  return { message, warning: OVERFLOW_WARNING };
}

const OVERFLOW_WARNING =
  'O dia pedido já tinha atingido o limite diário de publicações do site; a publicação foi para o próximo dia com vaga, no mesmo horário.';

/**
 * Desfecho de um artigo do lote, pronto para o resultado do diálogo: no ar, agendado em `at`
 * (data e hora de São Paulo, o dia do limite diário) com o aviso do transbordo, ou falhou, com o
 * motivo.
 */
export type BatchItemResult =
  | { contentId: number; outcome: 'published' }
  | { contentId: number; outcome: 'scheduled'; at: string; warning?: string }
  | { contentId: number; outcome: 'failed'; message: string };

/** Lote enviado (um desfecho por artigo, na ordem enviada) ou recusado inteiro. */
export type ApproveBatchResult =
  { ok: true; items: BatchItemResult[] } | { ok: false; message: string };

/**
 * Aprova e publica em lote os artigos que o revisor confirmou ter lido no resumo (#776). O
 * domínio confere a elegibilidade de cada um, grava as confirmações e publica ou agenda o
 * transbordo; uma falha desfaz só aquele artigo. Revalida a fila e cada artigo decidido.
 */
export async function approveBatchAction(
  siteId: string,
  items: BatchItem[],
): Promise<ApproveBatchResult> {
  const actor = await currentActor();
  if (!actor.ok) return { ok: false, message: INVALID_SESSION };
  const result = await getDb().db.transaction((tx) =>
    approveAndPublishBatch(tx, actor.value, siteId, items),
  );
  if (!result.ok) {
    return { ok: false, message: result.issues.map((issue) => issue.message).join(' ') };
  }
  revalidatePath(`/sites/${siteId}/revisao`);
  const outcomes = result.value.map((item): BatchItemResult => {
    const { contentId } = item;
    if (item.outcome === 'failed') {
      return {
        contentId,
        outcome: 'failed',
        message: item.issues.map((issue) => issue.message).join(' '),
      };
    }
    revalidateReview(siteId, contentId);
    if (item.outcome === 'published') return { contentId, outcome: 'published' };
    return {
      contentId,
      outcome: 'scheduled',
      at: formatDateTime(item.at, PUBLISH_DAY_TIME_ZONE),
      ...(item.overflowed ? { warning: OVERFLOW_WARNING } : {}),
    };
  });
  return { ok: true, items: outcomes };
}

/**
 * Devolve ao editor a versão que o revisor viu, com o comentário do que corrigir. Com
 * `autoCorrect`, pede também a correção automática (workspace#95, ADR 0023 da unidade).
 */
export async function returnAction(
  siteId: string,
  contentId: number,
  version: number,
  comment: string,
  autoCorrect = false,
): Promise<DecisionResult> {
  const actor = await currentActor();
  if (!actor.ok) {
    return {
      ok: false,
      message: INVALID_SESSION,
      issues: [{ path: [], message: INVALID_SESSION }],
    };
  }
  const result = await withNext(actor.value, siteId, contentId, (tx) =>
    returnVersion(tx, actor.value, siteId, contentId, version, comment, { autoCorrect }),
  );
  if (!result.ok) {
    // O comentário é o único campo: a recusa dele vai ao campo; o resto, ao resumo.
    return {
      ok: false,
      message: 'Não foi possível devolver.',
      issues: result.issues.map((issue) => ({
        path: issue.path[0] === 'comment' ? ['comment'] : [],
        message: issue.message,
      })),
    };
  }
  revalidateReview(siteId, contentId);
  return {
    ok: true,
    message: autoCorrect
      ? `Versão ${version} devolvida ao editor; a correção automática foi pedida.`
      : `Versão ${version} devolvida ao editor.`,
    next: result.value.next,
  };
}

/**
 * Corrige a versão que o revisor viu (#751): `amendInReview` grava a N+1 já em revisão e tira a
 * vista da fila. O editor, no modo `amend`, volta à revisão no sucesso; a recusa (versão que
 * saiu de revisão, permissão, validação) volta aos campos como na edição.
 */
export async function amendAction(
  siteId: string,
  contentId: number,
  version: number,
  input: ContentEdit,
): Promise<ContentFormResult> {
  const actor = await currentActor();
  if (!actor.ok) return noSession;
  const result = await getDb().db.transaction(async (tx) =>
    amendInReview(
      tx,
      actor.value,
      siteId,
      contentId,
      version,
      input,
      await resourcesFor(tx, siteId),
    ),
  );
  if (!result.ok) return refused(result.issues);
  const { version: saved, created } = result.value;
  if (!created) {
    return {
      ok: true,
      message: `Nenhuma alteração; a versão ${saved} continua em revisão.`,
      id: contentId,
    };
  }
  revalidateReview(siteId, contentId);
  revalidatePath(`/sites/${siteId}/conteudos`);
  return { ok: true, message: `Correção salva na versão ${saved}.`, id: contentId };
}

/** A fila, a tela de revisão, o conteúdo e o editor mudam com a decisão. */
function revalidateReview(siteId: string, contentId: number): void {
  revalidatePath(`/sites/${siteId}/revisao`);
  revalidatePath(`/sites/${siteId}/revisao/${contentId}`);
  revalidatePath(`/sites/${siteId}/conteudos/${contentId}`);
  revalidatePath(`/sites/${siteId}/conteudos/${contentId}/editar`);
}
