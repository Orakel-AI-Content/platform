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
import {
  confirmInfraPlan,
  confirmInfraRemovalPlan,
  readInfraPlan,
  requestInfraPlan,
  requestInfraRemovalPlan,
  type InfraPlanView,
} from '@/domain/infra/plan.ts';
import {
  cancelBuild,
  requestBuildNow,
  requestRollback,
  requestUndoLastPublish,
  siteActivity,
  type SiteActivity,
} from '@/domain/builds/builds.ts';
import {
  pauseSiteManually,
  rebuildOnRelease,
  resumeSite,
  retreatLifecycle,
  revertRelease,
  setBuildWindow,
  setDailyPublishLimit,
  type ManualLifecycleStep,
} from '@/domain/builds/site-state.ts';
import { registerPolicyTrigger } from '@/domain/sites/policy-triggers.ts';
import {
  createSite,
  readSiteInfraCheck,
  requestSiteInfraCheck,
  updateSiteConfig,
  type SiteInfraCheck,
} from '@/domain/sites/sites.ts';

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

/**
 * Status e histórico do site (#635), para a página consultar enquanto há execução aberta.
 * Só leitura: o papel (`site.read`) e o site são conferidos pelo domínio. `null` sem sessão,
 * permissão ou site, como as leituras de polling (`uploadStatusAction`).
 */
export async function siteActivityAction(siteId: string): Promise<SiteActivity | null> {
  const actor = await currentActor();
  if (!actor.ok) return null;
  const result = await siteActivity(getDb().db, actor.value, siteId);
  return result.ok ? result.value : null;
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
async function siteOperation<T>(
  siteId: string,
  run: (tx: Executor, actor: Actor) => Promise<Result<T>>,
  success: string | ((value: T) => string),
): Promise<ActionResult> {
  const actor = await currentActor();
  if (!actor.ok) return { ok: false, message: 'Sessão inválida; entre de novo.' };
  const result = await getDb().db.transaction((tx) => run(tx, actor.value));
  if (!result.ok) {
    return { ok: false, message: result.issues[0]?.message ?? 'Não foi possível concluir.' };
  }
  revalidatePath('/sites');
  revalidatePath(`/sites/${siteId}`);
  return { ok: true, message: typeof success === 'string' ? success : success(result.value) };
}

const STEP_LABEL: Record<ManualLifecycleStep, string> = {
  infra_aplicada: 'Infra aplicada',
  zona_ativa: 'Zona ativa',
};

/**
 * "Conferir agora" (workspace#85): enfileira a conferência da infra só deste site; papel e
 * etapa são do domínio. O resultado chega pelo polling de `siteInfraCheckAction`.
 */
export async function checkSiteInfraAction(siteId: string): Promise<ActionResult> {
  return siteOperation(
    siteId,
    (tx, actor) => requestSiteInfraCheck(tx, actor, siteId),
    'Conferência da infra enfileirada.',
  );
}

/**
 * Conferência da infra do site, para a etapa "Infra e zona" consultar enquanto há conferência
 * na fila. Só leitura (`site.read` no domínio); `null` sem sessão, permissão ou site, como
 * `siteActivityAction`.
 */
export async function siteInfraCheckAction(siteId: string): Promise<SiteInfraCheck | null> {
  const actor = await currentActor();
  if (!actor.ok) return null;
  const result = await readSiteInfraCheck(getDb().db, actor.value, siteId);
  return result.ok ? result.value : null;
}

/** Pedido do plano de "Criar infraestrutura": a execução aberta, ou a recusa em mensagem. */
export type InfraPlanRequest = { ok: true; runId: number } | { ok: false; message: string };

/**
 * "Criar infraestrutura" (#825): grava a execução e enfileira o plano; papel, etapa e execução
 * aberta são do domínio. Sem toast: o diálogo mostra o andamento e lê o plano por
 * `infraPlanAction`. Revalida a página, para a etapa passar a "Revisar e confirmar".
 */
export async function requestInfraPlanAction(siteId: string): Promise<InfraPlanRequest> {
  const actor = await currentActor();
  if (!actor.ok) return { ok: false, message: 'Sessão inválida; entre de novo.' };
  const result = await getDb().db.transaction((tx) => requestInfraPlan(tx, actor.value, siteId));
  if (!result.ok) {
    return {
      ok: false,
      message: result.issues[0]?.message ?? 'Não foi possível pedir o plano.',
    };
  }
  revalidatePath(`/sites/${siteId}`);
  return { ok: true, runId: result.value.runId };
}

/**
 * Plano da execução, para o diálogo consultar enquanto ele é preparado. Só leitura
 * (`site.configure` no domínio); `null` sem sessão, permissão ou execução do site.
 */
export async function infraPlanAction(
  siteId: string,
  runId: number,
): Promise<InfraPlanView | null> {
  const actor = await currentActor();
  if (!actor.ok) return null;
  const result = await readInfraPlan(getDb().db, actor.value, siteId, runId);
  return result.ok ? result.value : null;
}

/** "Confirmar" o plano: a execução passa a aplicando e o apply entra na fila (domínio). */
export async function confirmInfraPlanAction(siteId: string, runId: number): Promise<ActionResult> {
  return siteOperation(
    siteId,
    (tx, actor) => confirmInfraPlan(tx, actor, siteId, runId),
    'Criação da infraestrutura confirmada.',
  );
}

/**
 * "Remover infraestrutura" (workspace#97): grava a remoção e enfileira o plano de destruição;
 * papel (`site.destroy`), site pausado, etapa e execução aberta são do domínio. Como na criação,
 * sem toast: o diálogo lê o plano por `infraPlanAction`.
 */
export async function requestInfraRemovalAction(siteId: string): Promise<InfraPlanRequest> {
  const actor = await currentActor();
  if (!actor.ok) return { ok: false, message: 'Sessão inválida; entre de novo.' };
  const result = await getDb().db.transaction((tx) =>
    requestInfraRemovalPlan(tx, actor.value, siteId),
  );
  if (!result.ok) {
    return {
      ok: false,
      message: result.issues[0]?.message ?? 'Não foi possível pedir o plano.',
    };
  }
  revalidatePath(`/sites/${siteId}`);
  return { ok: true, runId: result.value.runId };
}

/**
 * "Remover" com o domínio digitado: o domínio confere de novo no servidor, e só então a remoção
 * passa a aplicando e o primeiro elo da cadeia entra na fila (domínio).
 */
export async function confirmInfraRemovalAction(
  siteId: string,
  runId: number,
  typedDomain: string,
): Promise<ActionResult> {
  return siteOperation(
    siteId,
    (tx, actor) => confirmInfraRemovalPlan(tx, actor, siteId, runId, typedDomain),
    'Remoção da infraestrutura confirmada.',
  );
}

/** "Desmarcar" a etapa manual atual: volta só à anterior (a ordem e a corrida são do domínio). */
export async function retreatLifecycleAction(
  siteId: string,
  step: ManualLifecycleStep,
): Promise<ActionResult> {
  return siteOperation(
    siteId,
    (tx, actor) => retreatLifecycle(tx, actor, siteId, step),
    `${STEP_LABEL[step]} desmarcada.`,
  );
}

/** "Retomar" o site pausado: volta a ativo e enfileira o build já (a regra é do domínio). */
export async function resumeSiteAction(siteId: string): Promise<ActionResult> {
  return siteOperation(
    siteId,
    (tx, actor) => resumeSite(tx, actor, siteId),
    `${siteId} retomado; build enfileirado.`,
  );
}

/**
 * "Pausar" o site ativo com o motivo informado; "Retomar" desfaz. Papel, motivo e estado são
 * conferidos pelo domínio.
 */
export async function pauseSiteAction(siteId: string, reason: string): Promise<ActionResult> {
  return siteOperation(
    siteId,
    (tx, actor) => pauseSiteManually(tx, actor, siteId, reason),
    `${siteId} pausado.`,
  );
}

/**
 * "Reconstruir na release X": grava a release do site, retoma se pausado e enfileira o build
 * já. Release registrada, papel e site são conferidos pelo domínio.
 */
export async function rebuildOnReleaseAction(siteId: string, tag: string): Promise<ActionResult> {
  return siteOperation(
    siteId,
    (tx, actor) => rebuildOnRelease(tx, actor, siteId, tag),
    `${siteId} na release ${tag}; build enfileirado.`,
  );
}

/**
 * "Voltar à versão anterior": troca o site para a release de onde veio a última troca de
 * versão e enfileira o build. O destino, o papel e o site são resolvidos pelo domínio; a
 * release não vem do cliente.
 */
export async function revertReleaseAction(siteId: string): Promise<ActionResult> {
  return siteOperation(
    siteId,
    (tx, actor) => revertRelease(tx, actor, siteId),
    (tag) => `${siteId} de volta à release ${tag}; build enfileirado.`,
  );
}

/**
 * "Reverter": enfileira o rollback do site para uma versão já publicada. A versão (de um
 * build `ok` do site e diferente da ativa) e o papel são conferidos pelo domínio.
 */
export async function rollbackSiteAction(siteId: string, versionId: string): Promise<ActionResult> {
  return siteOperation(
    siteId,
    (tx, actor) => requestRollback(tx, actor, siteId, versionId),
    `Rollback de ${siteId} para ${versionId} enfileirado.`,
  );
}

/**
 * "Desfazer última publicação": enfileira o rollback para a versão que estava no ar antes da
 * ativa. O destino, o papel e o site são resolvidos pelo domínio; a versão não vem do cliente.
 */
export async function undoLastPublishAction(siteId: string): Promise<ActionResult> {
  return siteOperation(
    siteId,
    (tx, actor) => requestUndoLastPublish(tx, actor, siteId),
    (previous) => `Rollback de ${siteId} para ${previous.versionId} enfileirado.`,
  );
}

/**
 * "Cancelar" a publicação aberta do site: na fila, sai da fila; rodando, o pedido fica marcado
 * para o build-runner. Papel, site e execução aberta são conferidos pelo domínio.
 */
export async function cancelBuildAction(siteId: string): Promise<ActionResult> {
  return siteOperation(
    siteId,
    (tx, actor) => cancelBuild(tx, actor, siteId),
    (outcome) =>
      outcome === 'cancelado'
        ? `Publicação de ${siteId} cancelada.`
        : `Cancelamento da publicação em andamento de ${siteId} pedido.`,
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
