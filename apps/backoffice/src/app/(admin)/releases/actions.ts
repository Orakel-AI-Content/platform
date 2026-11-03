'use server';

import { revalidatePath } from 'next/cache';

import { currentActor } from '@/auth/request-actor.ts';
import type { ReleaseFormResult } from '@/components/releases/ReleaseForm';
import { getDb } from '@/db/client.ts';
import { registerRelease } from '@/domain/releases/releases.ts';
import type { RegisterReleaseValue } from '@/domain/releases/tag.ts';

/** Cadastro de release: formato, duplicata e permissão ficam no domínio (`registerRelease`). */
export async function registerReleaseAction(
  value: RegisterReleaseValue,
): Promise<ReleaseFormResult> {
  const actor = await currentActor();
  if (!actor.ok) return { ok: false, message: 'Sessão inválida; entre de novo.', issues: [] };
  // O valor vem do cliente: o domínio valida a tag de novo.
  const result = await getDb().db.transaction((tx) => registerRelease(tx, actor.value, value.tag));
  if (!result.ok) {
    return {
      ok: false,
      message: 'Não foi possível registrar a release.',
      issues: result.issues.map((issue) => ({
        path: issue.path.map((key) => (typeof key === 'number' ? key : String(key))),
        message: issue.message,
      })),
    };
  }
  revalidatePath('/releases');
  return { ok: true, message: `Release ${result.value.tag} registrada.` };
}
