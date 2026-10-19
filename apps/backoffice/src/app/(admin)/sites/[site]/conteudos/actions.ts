'use server';

import type { Issue } from '@orakel/content-model';
import { revalidatePath } from 'next/cache';

import { currentActor } from '@/auth/request-actor.ts';
import type { ContentFormResult } from '@/components/contents/contentEditorValues.ts';
import type { ActionResult } from '@/components/shared/actionResult.ts';
import { getDb } from '@/db/client.ts';
import {
  createContent,
  listContentVersions,
  submitForReview,
  updateContent,
  type ContentEdit,
} from '@/domain/content/contents.ts';
import { resourcesFor } from '@/domain/sites/sites.ts';

// Ações do editor de conteúdo: permissão, validação e o `n` dos blocos ficam no domínio; a
// validação usa os recursos da release do site (`resourcesFor`).

/** Issues do domínio no formato serializável do editor (o `path` aponta o campo). */
function refused(issues: readonly Issue[]): ContentFormResult {
  return {
    ok: false,
    message: 'Não foi possível salvar o conteúdo.',
    issues: issues.map((issue) => ({
      path: issue.path.map((key) => (typeof key === 'number' ? key : String(key))),
      message: issue.message,
    })),
  };
}

const noSession: ContentFormResult = {
  ok: false,
  message: 'Sessão inválida; entre de novo.',
  issues: [],
};

/** Cria o conteúdo com a versão 1 em rascunho. */
export async function createContentAction(
  siteId: string,
  input: ContentEdit,
): Promise<ContentFormResult> {
  const actor = await currentActor();
  if (!actor.ok) return noSession;
  const result = await getDb().db.transaction(async (tx) =>
    createContent(tx, actor.value, siteId, input, { resources: await resourcesFor(tx, siteId) }),
  );
  if (!result.ok) return refused(result.issues);
  revalidatePath(`/sites/${siteId}/conteudos`);
  return { ok: true, message: 'Conteúdo criado.', id: result.value.id };
}

/**
 * Grava a versão N+1 do conteúdo em rascunho e a devolve relida do servidor: o editor
 * continua nela (#109), com os `n` que o servidor deu aos blocos novos.
 */
export async function updateContentAction(
  siteId: string,
  contentId: number,
  input: ContentEdit,
): Promise<ContentFormResult> {
  const actor = await currentActor();
  if (!actor.ok) return noSession;
  const { db } = getDb();
  const result = await db.transaction(async (tx) =>
    updateContent(tx, actor.value, siteId, contentId, input, await resourcesFor(tx, siteId)),
  );
  if (!result.ok) return refused(result.issues);
  revalidatePath(`/sites/${siteId}/conteudos`);
  revalidatePath(`/sites/${siteId}/conteudos/${contentId}`);
  const versions = await listContentVersions(db, actor.value, siteId, contentId);
  const saved = versions.ok
    ? versions.value.find((version) => version.version === result.value.version)?.data
    : undefined;
  return { ok: true, message: `Versão ${result.value.version} salva.`, id: contentId, saved };
}

/** Envia a versão mais recente (em rascunho) para revisão; a regra é do domínio. */
export async function submitForReviewAction(
  siteId: string,
  contentId: number,
): Promise<ActionResult> {
  const actor = await currentActor();
  if (!actor.ok) return { ok: false, message: noSession.message };
  const result = await getDb().db.transaction((tx) =>
    submitForReview(tx, actor.value, siteId, contentId),
  );
  if (!result.ok) {
    return { ok: false, message: result.issues.map((issue) => issue.message).join(' ') };
  }
  revalidatePath(`/sites/${siteId}/conteudos`);
  revalidatePath(`/sites/${siteId}/conteudos/${contentId}`);
  revalidatePath(`/sites/${siteId}/revisao`);
  return { ok: true, message: 'Enviado para revisão.' };
}
