'use server';

import type { Result } from '@orakel/content-model';
import { revalidatePath } from 'next/cache';

import { currentActor } from '@/auth/request-actor.ts';
import type { SchemaFormIssue } from '@/components/forms/SchemaForm';
import type { FormActionResult } from '@/components/shared/actionResult.ts';
import { formatDateTime } from '@/components/shared/siteLabels.ts';
import { getDb, type Executor } from '@/db/client.ts';
import type { Actor } from '@/domain/access/rbac.ts';
import { PUBLISH_DAY_TIME_ZONE } from '@/domain/publications/publish.ts';
import { setAllConfirmations, setConfirmation } from '@/domain/reviews/confirmations.ts';
import {
  approveAndPublish,
  approveAndSchedule,
  approveVersion,
  returnVersion,
  type ApprovalOutcome,
} from '@/domain/reviews/reviews.ts';

// Ações da tela de revisão (#75, #598, #749, workspace#89): permissão, confirmações, comentário,
// validação da release, limite diário e transbordo ficam no domínio (confirmations.ts,
// approveVersion, approveAndPublish, approveAndSchedule, returnVersion); aqui só a tradução do
// Result para o painel.

export type ApproveResult = FormActionResult<SchemaFormIssue>;

/**
 * Desfecho de aprovar e publicar ou agendar: a mensagem de sucesso e, quando o dia pedido estava
 * cheio e a publicação foi para a próxima vaga, o aviso (`warning`).
 */
export type DecisionResult =
  { ok: true; message: string; warning?: string } | Extract<ApproveResult, { ok: false }>;

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
): Promise<ApproveResult> {
  const actor = await currentActor();
  if (!actor.ok) {
    return {
      ok: false,
      message: INVALID_SESSION,
      issues: [{ path: [], message: INVALID_SESSION }],
    };
  }
  const result = await getDb().db.transaction((tx) =>
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
  return { ok: true, message: `Versão ${version} aprovada.` };
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
  const result = await getDb().db.transaction((tx) => run(tx, actor.value));
  if (!result.ok) {
    // Recusa da aprovação ou da publicação: tudo foi desfeito; no formulário, o resumo.
    return {
      ok: false,
      message: 'Não foi possível aprovar.',
      issues: result.issues.map((issue) => ({ path: [], message: issue.message })),
    };
  }
  revalidateReview(siteId, contentId);
  return decisionMessage(version, result.value);
}

/** "Foi ao ar" ou "agendado para <data e hora de São Paulo>", com o aviso do transbordo. */
function decisionMessage(version: number, outcome: ApprovalOutcome): DecisionResult {
  const message =
    outcome.outcome === 'published'
      ? `Versão ${version} aprovada: o artigo foi ao ar.`
      : `Versão ${version} aprovada: o artigo foi agendado para ${formatDateTime(outcome.at, PUBLISH_DAY_TIME_ZONE)}.`;
  if (!outcome.overflowed) return { ok: true, message };
  return {
    ok: true,
    message,
    warning:
      'O dia pedido já tinha atingido o limite diário de publicações do site; a publicação foi para o próximo dia com vaga, no mesmo horário.',
  };
}

/** Devolve ao editor a versão que o revisor viu, com o comentário do que corrigir. */
export async function returnAction(
  siteId: string,
  contentId: number,
  version: number,
  comment: string,
): Promise<ApproveResult> {
  const actor = await currentActor();
  if (!actor.ok) {
    return {
      ok: false,
      message: INVALID_SESSION,
      issues: [{ path: [], message: INVALID_SESSION }],
    };
  }
  const result = await getDb().db.transaction((tx) =>
    returnVersion(tx, actor.value, siteId, contentId, version, comment),
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
  return { ok: true, message: `Versão ${version} devolvida ao editor.` };
}

/** A fila, a tela de revisão, o conteúdo e o editor mudam com a decisão. */
function revalidateReview(siteId: string, contentId: number): void {
  revalidatePath(`/sites/${siteId}/revisao`);
  revalidatePath(`/sites/${siteId}/revisao/${contentId}`);
  revalidatePath(`/sites/${siteId}/conteudos/${contentId}`);
  revalidatePath(`/sites/${siteId}/conteudos/${contentId}/editar`);
}
