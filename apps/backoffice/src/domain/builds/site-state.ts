// Colunas operacionais do site (estado, motivo e culpado da pausa, versão ativa, ciclo de
// vida, janela dos builds, limite diário de publicações, despublicação em massa declarada),
// gravadas pelo build e pela operação. Não vão para o snapshot: gravar aqui não gera mudança pendente — senão cada build agendaria outro. Único
// módulo fora de pending-changes liberado no teste de varredura.
import type { Culprit } from '@orakel/build-contract';
import type { Result } from '@orakel/content-model';
import { and, eq, ne } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { sites } from '../../db/schema/index.ts';
import { requireRole, type Actor } from '../access/rbac.ts';
import { buildNow } from './schedule.ts';

/**
 * Falha permanente: o site para de receber builds até ser retomado (L4). Grava o culpado
 * junto do motivo; sem ele, limpa o de uma pausa anterior.
 */
export async function pauseSite(
  tx: Executor,
  siteId: string,
  reason: string,
  culprit?: Culprit,
): Promise<void> {
  await tx
    .update(sites)
    .set({
      state: 'pausado',
      pausedReason: reason,
      pausedCulpritOrigin: culprit?.origin ?? null,
      pausedCulpritReference: culprit?.reference ?? null,
    })
    .where(eq(sites.id, siteId));
}

/**
 * "Retomar" (L4): o site pausado volta a `ativo`, sem motivo nem culpado, e o build entra na
 * fila já, publicando as mudanças represadas (a falha não as baixou). O update condicional
 * decide a corrida: de dois "Retomar" simultâneos, só um enfileira.
 */
export async function resumeSite(
  tx: Executor,
  actor: Actor,
  siteId: string,
): Promise<Result<void>> {
  const allowed = requireRole(actor, 'operations.run');
  if (!allowed.ok) return allowed;

  const updated = await tx
    .update(sites)
    .set({
      state: 'ativo',
      pausedReason: null,
      pausedCulpritOrigin: null,
      pausedCulpritReference: null,
    })
    .where(and(eq(sites.id, siteId), eq(sites.state, 'pausado')))
    .returning({ id: sites.id });
  if (updated.length > 0) {
    await buildNow(tx, siteId);
    return { ok: true, value: undefined };
  }

  const [site] = await tx.select({ state: sites.state }).from(sites).where(eq(sites.id, siteId));
  if (site === undefined) {
    return {
      ok: false,
      issues: [{ code: 'site.not_found', message: `Site ${siteId} não encontrado`, path: [] }],
    };
  }
  return {
    ok: false,
    issues: [
      {
        code: 'site.not_paused',
        message: `O site ${siteId} não está pausado; não há o que retomar`,
        path: [],
      },
    ],
  };
}

/** Primeira publicação bem-sucedida: o site passa a `publicado`. */
export async function markPublished(tx: Executor, siteId: string): Promise<void> {
  await tx
    .update(sites)
    .set({ lifecycle: 'publicado' })
    .where(and(eq(sites.id, siteId), ne(sites.lifecycle, 'publicado')));
}

/** A versão publicada passa a ser a que está no ar (referência da trava de segurança). */
export async function setActiveVersion(
  tx: Executor,
  siteId: string,
  versionId: string,
): Promise<void> {
  await tx.update(sites).set({ activeVersionId: versionId }).where(eq(sites.id, siteId));
}

/**
 * Declara a despublicação em massa do site (quem e quando), para o próximo build passar pela
 * trava de segurança. Uma declaração ainda não consumida é substituída pela nova. A data vem
 * do processo, em milissegundos, para voltar idêntica ao `clearMassUnpublish`.
 */
export async function declareMassUnpublish(
  tx: Executor,
  siteId: string,
  declaredBy: string,
  declaredAt: Date = new Date(),
): Promise<Date> {
  await tx
    .update(sites)
    .set({ massUnpublishDeclaredBy: declaredBy, massUnpublishDeclaredAt: declaredAt })
    .where(eq(sites.id, siteId));
  return declaredAt;
}

/**
 * Consome a declaração que o build usou (`declaredAt`). Uma mais nova, feita durante o build,
 * fica para o próximo: o snapshot deste pode não ter visto as despublicações dela.
 */
export async function clearMassUnpublish(
  tx: Executor,
  siteId: string,
  declaredAt: Date,
): Promise<void> {
  await tx
    .update(sites)
    .set({ massUnpublishDeclaredBy: null, massUnpublishDeclaredAt: null })
    .where(and(eq(sites.id, siteId), eq(sites.massUnpublishDeclaredAt, declaredAt)));
}

/** Etapas marcadas à mão pela operação, cada uma com a etapa de que parte. */
const MANUAL_STEPS = {
  infra_aplicada: 'cadastrado',
  zona_ativa: 'infra_aplicada',
} as const;

export type ManualLifecycleStep = keyof typeof MANUAL_STEPS;

/**
 * Marca uma etapa manual do ciclo de vida, só a partir da anterior (sem voltar nem pular).
 * O update condicional decide a ordem: duas marcações simultâneas não passam as duas.
 */
export async function advanceLifecycle(
  tx: Executor,
  actor: Actor,
  siteId: string,
  step: ManualLifecycleStep,
): Promise<Result<void>> {
  const allowed = requireRole(actor, 'site.configure');
  if (!allowed.ok) return allowed;

  const from = MANUAL_STEPS[step];
  const updated = await tx
    .update(sites)
    .set({ lifecycle: step })
    .where(and(eq(sites.id, siteId), eq(sites.lifecycle, from)))
    .returning({ id: sites.id });
  if (updated.length > 0) return { ok: true, value: undefined };

  const [site] = await tx
    .select({ lifecycle: sites.lifecycle })
    .from(sites)
    .where(eq(sites.id, siteId));
  if (site === undefined) {
    return {
      ok: false,
      issues: [{ code: 'site.not_found', message: `Site ${siteId} não encontrado`, path: [] }],
    };
  }
  return {
    ok: false,
    issues: [
      {
        code: 'site.lifecycle_order',
        message: `${step} só pode ser marcada a partir de ${from}; o site está em ${site.lifecycle}`,
        path: ['lifecycle'],
      },
    ],
  };
}

/**
 * Define a janela de agrupamento dos builds do site, em segundos; `null` volta à padrão
 * (BUILD_WINDOW_SECONDS). Vale da próxima publicação em diante: um build já agendado mantém
 * o horário.
 */
export async function setBuildWindow(
  tx: Executor,
  actor: Actor,
  siteId: string,
  seconds: number | null,
): Promise<Result<void>> {
  const allowed = requireRole(actor, 'site.configure');
  if (!allowed.ok) return allowed;
  if (seconds !== null && !(Number.isInteger(seconds) && seconds >= 0)) {
    return {
      ok: false,
      issues: [
        {
          code: 'site.build_window_invalid',
          message: `A janela é um número inteiro de segundos, 0 ou mais; recebido ${seconds}`,
          path: ['buildWindowSeconds'],
        },
      ],
    };
  }

  const updated = await tx
    .update(sites)
    .set({ buildWindowSeconds: seconds })
    .where(eq(sites.id, siteId))
    .returning({ id: sites.id });
  if (updated.length === 0) {
    return {
      ok: false,
      issues: [{ code: 'site.not_found', message: `Site ${siteId} não encontrado`, path: [] }],
    };
  }
  return { ok: true, value: undefined };
}

/**
 * Define o limite diário de publicações do site (#490); `null` volta ao padrão
 * (PUBLISH_DAILY_LIMIT). A tela aceita só inteiro 1 ou mais: o `0` que o banco aceita
 * (bloqueia as publicações, ADR 0017) fica fora dela. Vale para a próxima publicação.
 */
export async function setDailyPublishLimit(
  tx: Executor,
  actor: Actor,
  siteId: string,
  limit: number | null,
): Promise<Result<void>> {
  const allowed = requireRole(actor, 'site.configure');
  if (!allowed.ok) return allowed;
  if (limit !== null && !(Number.isInteger(limit) && limit >= 1)) {
    return {
      ok: false,
      issues: [
        {
          code: 'site.daily_publish_limit_invalid',
          message: `O limite é um número inteiro de publicações, 1 ou mais; recebido ${limit}`,
          path: ['dailyPublishLimit'],
        },
      ],
    };
  }

  const updated = await tx
    .update(sites)
    .set({ dailyPublishLimit: limit })
    .where(eq(sites.id, siteId))
    .returning({ id: sites.id });
  if (updated.length === 0) {
    return {
      ok: false,
      issues: [{ code: 'site.not_found', message: `Site ${siteId} não encontrado`, path: [] }],
    };
  }
  return { ok: true, value: undefined };
}
