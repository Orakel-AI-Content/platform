// Colunas operacionais do site (estado, motivo e culpado da pausa, versão ativa, release, ciclo de
// vida, janela dos builds, limite diário de publicações, despublicação em massa declarada),
// gravadas pelo build e pela operação; pausa, retomada e troca de versão também viram uma linha
// de `site_events`, na mesma transação. Não vão para o snapshot: gravar aqui não gera mudança pendente — senão cada build agendaria outro. Único
// módulo fora de pending-changes liberado no teste de varredura.
import type { Culprit } from '@orakel/build-contract';
import type { Result } from '@orakel/content-model';
import { and, eq, ne } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { releases, siteEvents, sites } from '../../db/schema/index.ts';
import { requireRole, SYSTEM_ACTOR, type Actor } from '../access/rbac.ts';
import { buildNow } from './schedule.ts';

/** Registra uma mudança de estado do site (só inserção), na transação de quem a fez. */
async function recordSiteEvent(
  tx: Executor,
  event: Omit<typeof siteEvents.$inferInsert, 'id' | 'createdAt'>,
): Promise<void> {
  await tx.insert(siteEvents).values(event);
}

/**
 * Põe o site em `pausado` com o motivo e o culpado (sem ele, limpa o de uma pausa anterior) e
 * registra a pausa em nome de quem pediu. Com `onlyFromActive`, só pausa site `ativo`: o update
 * condicional decide a corrida. Devolve se pausou.
 */
async function pause(
  tx: Executor,
  siteId: string,
  options: { reason: string; culprit?: Culprit; requestedBy: string; onlyFromActive: boolean },
): Promise<boolean> {
  const { reason, culprit, requestedBy, onlyFromActive } = options;
  const updated = await tx
    .update(sites)
    .set({
      state: 'pausado',
      pausedReason: reason,
      pausedCulpritOrigin: culprit?.origin ?? null,
      pausedCulpritReference: culprit?.reference ?? null,
    })
    .where(
      onlyFromActive ? and(eq(sites.id, siteId), eq(sites.state, 'ativo')) : eq(sites.id, siteId),
    )
    .returning({ id: sites.id });
  if (updated.length === 0) return false;
  await recordSiteEvent(tx, {
    siteId,
    kind: 'pausa',
    requestedBy,
    reason,
    culpritOrigin: culprit?.origin ?? null,
    culpritReference: culprit?.reference ?? null,
  });
  return true;
}

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
  await pause(tx, siteId, {
    reason,
    ...(culprit === undefined ? {} : { culprit }),
    requestedBy: SYSTEM_ACTOR.email,
    onlyFromActive: false,
  });
}

/**
 * "Pausar" (L4): quem opera pausa o site ativo informando o motivo, sem culpado; o build na
 * fila passa a ser ignorado e "Retomar" desfaz. Só a partir de `ativo`: a pausa de um site já
 * pausado é recusada e o motivo dela fica.
 */
export async function pauseSiteManually(
  tx: Executor,
  actor: Actor,
  siteId: string,
  reason: string,
): Promise<Result<void>> {
  const allowed = requireRole(actor, 'operations.run');
  if (!allowed.ok) return allowed;

  const trimmed = reason.trim();
  if (trimmed === '') {
    return {
      ok: false,
      issues: [
        {
          code: 'site.pause_reason_required',
          message: 'Informe o motivo da pausa',
          path: ['reason'],
        },
      ],
    };
  }

  if (
    await pause(tx, siteId, { reason: trimmed, requestedBy: actor.email, onlyFromActive: true })
  ) {
    return { ok: true, value: undefined };
  }

  const [site] = await tx.select({ state: sites.state }).from(sites).where(eq(sites.id, siteId));
  if (site === undefined) {
    return {
      ok: false,
      issues: [{ code: 'site.not_found', message: `Site ${siteId} não encontrado`, path: [] }],
    };
  }
  if (site.state === 'pausado') {
    return {
      ok: false,
      issues: [
        {
          code: 'site.already_paused',
          message: `O site ${siteId} já está pausado`,
          path: [],
        },
      ],
    };
  }
  return {
    ok: false,
    issues: [
      {
        code: 'site.not_active',
        message: `O site ${siteId} está ${site.state}; só um site ativo pode ser pausado`,
        path: [],
      },
    ],
  };
}

/**
 * Tira o site da pausa: volta a `ativo`, sem motivo nem culpado, e registra a retomada em nome
 * de quem pediu. O update condicional decide a corrida (de duas retomadas, um evento); devolve
 * se o site estava pausado.
 */
async function unpause(tx: Executor, siteId: string, requestedBy: string): Promise<boolean> {
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
  if (updated.length === 0) return false;
  await recordSiteEvent(tx, { siteId, kind: 'retomada', requestedBy });
  return true;
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

  if (await unpause(tx, siteId, actor.email)) {
    await buildNow(tx, siteId, actor.email);
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

/**
 * "Reconstruir na release X" (L4): só release registrada (`releases`). Grava `sites.release`
 * (a tag da imagem `site-builder` dos próximos builds), retoma o site se pausado (como
 * "Retomar") e enfileira o build já. Site ativo também é reconstruído: trocar de release não
 * depende de pausa.
 */
export async function rebuildOnRelease(
  tx: Executor,
  actor: Actor,
  siteId: string,
  tag: string,
): Promise<Result<void>> {
  const allowed = requireRole(actor, 'operations.run');
  if (!allowed.ok) return allowed;

  const [registered] = await tx
    .select({ tag: releases.tag })
    .from(releases)
    .where(eq(releases.tag, tag));
  if (registered === undefined) {
    return {
      ok: false,
      issues: [
        {
          code: 'release.not_registered',
          message: `A release ${tag} não está registrada`,
          path: ['release'],
        },
      ],
    };
  }

  // A linha travada até o fim da transação: de duas trocas simultâneas, cada evento vê a
  // release que a outra deixou.
  const [current] = await tx
    .select({ release: sites.release })
    .from(sites)
    .where(eq(sites.id, siteId))
    .for('update');
  if (current === undefined) {
    return {
      ok: false,
      issues: [{ code: 'site.not_found', message: `Site ${siteId} não encontrado`, path: [] }],
    };
  }
  await tx.update(sites).set({ release: registered.tag }).where(eq(sites.id, siteId));
  await recordSiteEvent(tx, {
    siteId,
    kind: 'troca_de_versao',
    requestedBy: actor.email,
    previousRelease: current.release,
    release: registered.tag,
  });
  await unpause(tx, siteId, actor.email);
  await buildNow(tx, siteId, actor.email);
  return { ok: true, value: undefined };
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
