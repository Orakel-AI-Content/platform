'use server';

import { revalidatePath } from 'next/cache';

import { currentActor } from '@/auth/request-actor.ts';
import type { SchemaFormIssue } from '@/components/forms/SchemaForm';
import type { FormActionResult } from '@/components/shared/actionResult.ts';
import { getDb } from '@/db/client.ts';
import { approveVersion, returnVersion } from '@/domain/reviews/reviews.ts';

// Ações da tela de revisão (#75, #598): permissão, checklist, comentário e validação da release
// ficam no domínio (approveVersion, returnVersion); aqui só a tradução do Result para o painel.

export type ApproveResult = FormActionResult<SchemaFormIssue>;

/** Aprova a versão que o revisor viu, com as chaves do checklist marcadas. */
export async function approveAction(
  siteId: string,
  contentId: number,
  version: number,
  checklist: string[],
): Promise<ApproveResult> {
  const actor = await currentActor();
  if (!actor.ok) {
    const message = 'Sessão inválida; entre de novo.';
    return { ok: false, message, issues: [{ path: [], message }] };
  }
  const result = await getDb().db.transaction((tx) =>
    approveVersion(tx, actor.value, siteId, contentId, version, checklist),
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
    const message = 'Sessão inválida; entre de novo.';
    return { ok: false, message, issues: [{ path: [], message }] };
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
