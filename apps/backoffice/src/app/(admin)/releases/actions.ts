'use server';

import { revalidatePath } from 'next/cache';

import { currentActor } from '@/auth/request-actor.ts';
import type { ActionResult } from '@/components/shared/actionResult.ts';
import { getDb } from '@/db/client.ts';
import type { ReleaseBump } from '@/domain/releases/next-version.ts';
import { requestNewRelease, requestReleaseImageCheck } from '@/domain/releases/releases.ts';

/**
 * "Gerar nova versão": o domínio calcula o número pelo tipo de mudança, grava a release em
 * `gerando` e enfileira o run (`requestNewRelease`). A mensagem usa a tag devolvida, não a
 * proposta da tela, que pode ter ficado para trás.
 */
export async function requestNewReleaseAction(bump: ReleaseBump): Promise<ActionResult> {
  const actor = await currentActor();
  if (!actor.ok) return { ok: false, message: 'Sessão inválida; entre de novo.' };
  // O valor vem do cliente: o domínio valida o tipo de novo.
  const result = await getDb().db.transaction((tx) => requestNewRelease(tx, actor.value, bump));
  if (!result.ok) {
    return { ok: false, message: result.issues[0]?.message ?? 'Não foi possível gerar a versão.' };
  }
  revalidatePath('/releases');
  return { ok: true, message: `Versão ${result.value.tag} pedida; a geração começou.` };
}

/**
 * "Reconferir" da lista: enfileira de novo a conferência da imagem site-builder da release. A
 * conferência roda no build-runner (ADR 0011 da raiz); permissão e tag ficam no domínio.
 */
export async function recheckReleaseImageAction(tag: string): Promise<ActionResult> {
  const actor = await currentActor();
  if (!actor.ok) return { ok: false, message: 'Sessão inválida; entre de novo.' };
  const result = await getDb().db.transaction((tx) =>
    requestReleaseImageCheck(tx, actor.value, tag),
  );
  if (!result.ok) {
    return { ok: false, message: result.issues[0]?.message ?? 'Não foi possível reconferir.' };
  }
  revalidatePath('/releases');
  return {
    ok: true,
    message: `Conferência da imagem ${tag} enfileirada; recarregue a lista para ver o resultado.`,
  };
}
