'use server';

import { revalidatePath } from 'next/cache';

import { currentActor } from '@/auth/request-actor.ts';
import type { SchemaFormIssue } from '@/components/forms/SchemaForm';
import { getDb } from '@/db/client.ts';
import { approveVersion } from '@/domain/reviews/reviews.ts';

// Ação da tela de revisão (#75): permissão, checklist e validação da release ficam no
// domínio (approveVersion); aqui só a tradução do Result para o painel.

export type ApproveResult =
  { ok: true; message: string } | { ok: false; issues: SchemaFormIssue[] };

/** Aprova a versão que o revisor viu, com as chaves do checklist marcadas. */
export async function approveAction(
  siteId: string,
  contentId: number,
  version: number,
  checklist: string[],
): Promise<ApproveResult> {
  const actor = await currentActor();
  if (!actor.ok) {
    return { ok: false, issues: [{ path: [], message: 'Sessão inválida; entre de novo.' }] };
  }
  const result = await getDb().db.transaction((tx) =>
    approveVersion(tx, actor.value, siteId, contentId, version, checklist),
  );
  if (!result.ok) {
    // O checklist é um campo só no domínio; no formulário, o resumo acima dos itens.
    return {
      ok: false,
      issues: result.issues.map((issue) => ({ path: [], message: issue.message })),
    };
  }
  revalidatePath(`/sites/${siteId}/revisao`);
  revalidatePath(`/sites/${siteId}/revisao/${contentId}`);
  revalidatePath(`/sites/${siteId}/conteudos/${contentId}`);
  return { ok: true, message: `Versão ${version} aprovada.` };
}
