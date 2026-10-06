'use server';

import { revalidatePath } from 'next/cache';

import { currentActor } from '@/auth/request-actor.ts';
import { getDb } from '@/db/client.ts';
import { requestBuildNow } from '@/domain/builds/builds.ts';

export type ActionState = { ok: boolean; message: string };

/** "Publicar agora": a regra (papel, site pausado) fica no domínio. */
export async function publishNow(siteId: string): Promise<ActionState> {
  const actor = await currentActor();
  if (!actor.ok) return { ok: false, message: 'Sessão inválida; entre de novo.' };
  const result = await getDb().db.transaction((tx) => requestBuildNow(tx, actor.value, siteId));
  revalidatePath('/sites');
  return result.ok
    ? { ok: true, message: `Build de ${siteId} enfileirado.` }
    : { ok: false, message: result.issues[0]?.message ?? 'Não foi possível enfileirar o build.' };
}
