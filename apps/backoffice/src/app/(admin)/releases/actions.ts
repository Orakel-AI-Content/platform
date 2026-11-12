'use server';

import { revalidatePath } from 'next/cache';

import { currentActor } from '@/auth/request-actor.ts';
import type { ActionResult } from '@/components/shared/actionResult.ts';
import type { ReleasesSnapshot } from '@/components/releases/useReleasesSnapshot.ts';
import { getDb } from '@/db/client.ts';
import type { ReleaseBump } from '@/domain/releases/next-version.ts';
import { discardRelease, requestNewRelease, retryRelease } from '@/domain/releases/releases.ts';
import { startRollout } from '@/domain/releases/rollout.ts';

import { loadReleasesSnapshot } from './snapshot.ts';

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
 * "Tentar de novo" de uma release em `falhou`: o domínio a devolve à etapa que falhou, com o
 * mesmo número, e enfileira o job dessa etapa (`retryRelease`).
 */
export async function retryReleaseAction(tag: string): Promise<ActionResult> {
  const actor = await currentActor();
  if (!actor.ok) return { ok: false, message: 'Sessão inválida; entre de novo.' };
  const result = await getDb().db.transaction((tx) => retryRelease(tx, actor.value, tag));
  if (!result.ok) {
    return { ok: false, message: result.issues[0]?.message ?? 'Não foi possível tentar de novo.' };
  }
  revalidatePath('/releases');
  return { ok: true, message: `Versão ${tag}: a geração recomeçou.` };
}

/**
 * "Descartar": o domínio recusa a release que algum site usa (`release.in_use`), mesmo que a
 * tela, defasada, tenha mostrado o botão (`discardRelease`).
 */
export async function discardReleaseAction(tag: string): Promise<ActionResult> {
  const actor = await currentActor();
  if (!actor.ok) return { ok: false, message: 'Sessão inválida; entre de novo.' };
  const result = await getDb().db.transaction((tx) => discardRelease(tx, actor.value, tag));
  if (!result.ok) {
    return { ok: false, message: result.issues[0]?.message ?? 'Não foi possível descartar.' };
  }
  revalidatePath('/releases');
  return { ok: true, message: `Versão ${tag} descartada.` };
}

/**
 * "Atualizar todos os sites" (#703): o domínio escolhe o destino (a release `disponivel` mais
 * recente), grava a atualização e promove o primeiro site (`startRollout`). A mensagem usa a
 * versão devolvida, não a da confirmação, que pode ter ficado para trás.
 */
export async function startRolloutAction(): Promise<ActionResult> {
  const actor = await currentActor();
  if (!actor.ok) return { ok: false, message: 'Sessão inválida; entre de novo.' };
  const result = await getDb().db.transaction((tx) => startRollout(tx, actor.value));
  if (!result.ok) {
    return {
      ok: false,
      message: result.issues[0]?.message ?? 'Não foi possível iniciar a atualização.',
    };
  }
  revalidatePath('/releases');
  return {
    ok: true,
    message: `Atualização para ${result.value.targetRelease} iniciada pelo primeiro site.`,
  };
}

/**
 * Leitura da lista para o polling da tela, a mesma da página (`loadReleasesSnapshot`).
 * `undefined` sem sessão ou sem permissão; o polling tenta de novo no próximo tique.
 */
export async function releasesStatusAction(): Promise<ReleasesSnapshot | undefined> {
  const actor = await currentActor();
  if (!actor.ok) return undefined;
  const result = await loadReleasesSnapshot(getDb().db, actor.value);
  return result.ok ? result.value : undefined;
}
