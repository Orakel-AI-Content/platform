'use server';

import { revalidatePath } from 'next/cache';

import { currentActor } from '@/auth/request-actor.ts';
import type { ContentFormResult } from '@/components/contents/contentEditorValues.ts';
import type { SchemaFormIssue } from '@/components/forms/SchemaForm';
import type { FormActionResult } from '@/components/shared/actionResult.ts';
import { getDb } from '@/db/client.ts';
import { amendInReview, type ContentEdit } from '@/domain/content/contents.ts';
import { setAllConfirmations, setConfirmation } from '@/domain/reviews/confirmations.ts';
import { approveVersion, returnVersion } from '@/domain/reviews/reviews.ts';
import { resourcesFor } from '@/domain/sites/sites.ts';

import { noSession, refused } from '../content-form-result.ts';

// Ações da tela de revisão (#75, #598, #749, #751): permissão, confirmações, comentário e validação da
// release ficam no domínio (confirmations.ts, approveVersion, returnVersion); aqui só a tradução
// do Result para o painel.

export type ApproveResult = FormActionResult<SchemaFormIssue>;

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
