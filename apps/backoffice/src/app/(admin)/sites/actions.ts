'use server';

import type { Issue, Result } from '@orakel/content-model';
import type { SiteConfig } from '@orakel/content-model/v1';
import { revalidatePath } from 'next/cache';
import type * as z from 'zod';

import { currentActor } from '@/auth/request-actor.ts';
import type { ActionResult } from '@/components/shared/actionResult.ts';
import type { SiteFormResult } from '@/components/sites/siteConfigFormValues.ts';
import {
  BuildWindowSchema,
  DailyPublishLimitSchema,
  RegisterG1Schema,
  type BuildWindowValue,
  type DailyPublishLimitValue,
  type RegisterG1Value,
} from '@/components/sites/siteOperationForms.ts';
import { getDb, type Executor } from '@/db/client.ts';
import type { Actor } from '@/domain/access/rbac.ts';
import { requestBuildNow } from '@/domain/builds/builds.ts';
import {
  advanceLifecycle,
  setBuildWindow,
  setDailyPublishLimit,
  type ManualLifecycleStep,
} from '@/domain/builds/site-state.ts';
import { registerPolicyTrigger } from '@/domain/sites/policy-triggers.ts';
import { createSite, updateSiteConfig } from '@/domain/sites/sites.ts';

/** "Publicar agora": a regra (papel, site pausado) fica no domínio. */
export async function publishNow(siteId: string): Promise<ActionResult> {
  const actor = await currentActor();
  if (!actor.ok) return { ok: false, message: 'Sessão inválida; entre de novo.' };
  const result = await getDb().db.transaction((tx) => requestBuildNow(tx, actor.value, siteId));
  revalidatePath('/sites');
  return result.ok
    ? { ok: true, message: `Build de ${siteId} enfileirado.` }
    : { ok: false, message: result.issues[0]?.message ?? 'Não foi possível enfileirar o build.' };
}

/** Issues do domínio no formato serializável do formulário (o `path` aponta o campo). */
function refused(
  issues: readonly Issue[],
  message = 'Não foi possível salvar a configuração.',
): SiteFormResult {
  return {
    ok: false,
    message,
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

/** Ação operacional da página do site: o domínio decide, a resposta vira mensagem. */
async function siteOperation(
  siteId: string,
  run: (tx: Executor, actor: Actor) => Promise<Result<void>>,
  success: string,
): Promise<ActionResult> {
  const actor = await currentActor();
  if (!actor.ok) return { ok: false, message: 'Sessão inválida; entre de novo.' };
  const result = await getDb().db.transaction((tx) => run(tx, actor.value));
  if (!result.ok) {
    return { ok: false, message: result.issues[0]?.message ?? 'Não foi possível concluir.' };
  }
  revalidatePath('/sites');
  revalidatePath(`/sites/${siteId}`);
  return { ok: true, message: success };
}

const STEP_LABEL: Record<ManualLifecycleStep, string> = {
  infra_aplicada: 'Infra aplicada',
  zona_ativa: 'Zona ativa',
};

/** Etapa manual do ciclo de vida (só a partir da anterior; a ordem é do domínio). */
export async function advanceLifecycleAction(
  siteId: string,
  step: ManualLifecycleStep,
): Promise<ActionResult> {
  return siteOperation(
    siteId,
    (tx, actor) => advanceLifecycle(tx, actor, siteId, step),
    `${STEP_LABEL[step]} marcada.`,
  );
}

/**
 * Formulário de operação da página do site (#333): valida o valor pelo schema do formulário
 * (chega do cliente sem tipo garantido), o domínio decide, e a recusa com `path` volta ao campo.
 */
async function siteFormOperation<T>(
  siteId: string,
  schema: z.ZodType<T>,
  value: unknown,
  run: (tx: Executor, actor: Actor, value: T) => Promise<Result<void>>,
  success: (value: T) => string,
): Promise<SiteFormResult> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return refused(
      parsed.error.issues.map((issue) => ({
        code: `schema.${issue.code}`,
        message: issue.message,
        path: issue.path,
      })),
      'Não foi possível concluir.',
    );
  }
  const actor = await currentActor();
  if (!actor.ok) return noSession;
  const result = await getDb().db.transaction((tx) => run(tx, actor.value, parsed.data));
  if (!result.ok) return refused(result.issues, 'Não foi possível concluir.');
  revalidatePath('/sites');
  revalidatePath(`/sites/${siteId}`);
  return { ok: true, message: success(parsed.data) };
}

/** Registro do G1 do site, com observação opcional. */
export async function registerG1Action(
  siteId: string,
  value: RegisterG1Value,
): Promise<SiteFormResult> {
  return siteFormOperation(
    siteId,
    RegisterG1Schema,
    value,
    (tx, actor, { note }) =>
      registerPolicyTrigger(
        tx,
        actor,
        siteId,
        'G1',
        note === undefined || note === '' ? null : note,
      ),
    () => 'G1 registrado.',
  );
}

/** Janela de agrupamento do site em segundos; `null` ("Usar padrão") volta à padrão. */
export async function setBuildWindowAction(
  siteId: string,
  value: BuildWindowValue | null,
): Promise<SiteFormResult> {
  return siteFormOperation(
    siteId,
    BuildWindowSchema.nullable(),
    value,
    (tx, actor, window) => setBuildWindow(tx, actor, siteId, window?.buildWindowSeconds ?? null),
    (window) =>
      window === null
        ? 'Janela padrão restaurada.'
        : `Janela de ${window.buildWindowSeconds} s salva.`,
  );
}

/** Limite diário de publicações do site; `null` ("Usar padrão") volta ao padrão (#490). */
export async function setDailyPublishLimitAction(
  siteId: string,
  value: DailyPublishLimitValue | null,
): Promise<SiteFormResult> {
  return siteFormOperation(
    siteId,
    DailyPublishLimitSchema.nullable(),
    value,
    (tx, actor, limit) => setDailyPublishLimit(tx, actor, siteId, limit?.dailyPublishLimit ?? null),
    (limit) =>
      limit === null
        ? 'Limite padrão restaurado.'
        : `Limite de ${limit.dailyPublishLimit} por dia salvo.`,
  );
}
