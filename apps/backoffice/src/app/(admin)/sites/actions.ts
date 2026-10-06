'use server';

import type { Issue } from '@orakel/content-model';
import type { SiteConfig } from '@orakel/content-model/v1';
import { revalidatePath } from 'next/cache';

import { currentActor } from '@/auth/request-actor.ts';
import type { SiteFormResult } from '@/components/site-config-form-values.ts';
import { getDb } from '@/db/client.ts';
import { requestBuildNow } from '@/domain/builds/builds.ts';
import { createSite, updateSiteConfig } from '@/domain/sites/sites.ts';

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

/** Issues do domínio no formato serializável do formulário (o `path` aponta o campo). */
function refused(issues: readonly Issue[]): SiteFormResult {
  return {
    ok: false,
    message: 'Não foi possível salvar a configuração.',
    issues: issues.map((issue) => ({
      path: issue.path.map((key) => (typeof key === 'number' ? key : String(key))),
      message: issue.message,
    })),
  };
}

const noSession: SiteFormResult = {
  ok: false,
  message: 'Sessão inválida; entre de novo.',
  issues: [],
};

/** Cadastro do site: validação, permissão e regras (G1, recursos) ficam no domínio. */
export async function createSiteAction(config: SiteConfig): Promise<SiteFormResult> {
  const actor = await currentActor();
  if (!actor.ok) return noSession;
  const result = await getDb().db.transaction((tx) => createSite(tx, actor.value, config));
  if (!result.ok) return refused(result.issues);
  revalidatePath('/sites');
  return { ok: true, message: `Site ${result.value.siteId} cadastrado.` };
}

/** Edição da configuração: grava a versão nova pelo domínio. */
export async function updateSiteConfigAction(
  siteId: string,
  config: SiteConfig,
): Promise<SiteFormResult> {
  const actor = await currentActor();
  if (!actor.ok) return noSession;
  const result = await getDb().db.transaction((tx) =>
    updateSiteConfig(tx, actor.value, siteId, config),
  );
  if (!result.ok) return refused(result.issues);
  revalidatePath('/sites');
  return { ok: true, message: `Configuração salva (versão ${result.value.version}).` };
}
