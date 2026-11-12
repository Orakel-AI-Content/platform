// Colunas operacionais do site (estado, motivo e culpado da pausa, versão ativa, release, ciclo de
// vida, janela dos builds, limite diário de publicações, despublicação em massa declarada,
// conferência da infra), gravadas pelo build, pela operação e pelo backoffice-worker; pausa, retomada e troca de versão também viram uma linha
// de `site_events`, na mesma transação. Não vão para o snapshot: gravar aqui não gera mudança pendente — senão cada build agendaria outro. Único
// módulo fora de pending-changes liberado no teste de varredura.
import type { Culprit } from '@orakel/build-contract';
import type { Result } from '@orakel/content-model';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { releases, siteConfigs, siteEvents, sites } from '../../db/schema/index.ts';
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
 * "Reconstruir na release X" (L4): só release registrada (`releases`) e `disponivel` — a tela
 * filtra a lista, e o domínio é a proteção final contra release em outro estado. Grava `sites.release`
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
    .select({ tag: releases.tag, pipelineState: releases.pipelineState })
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
  if (registered.pipelineState !== 'disponivel') {
    return {
      ok: false,
      issues: [
        {
          code: 'release.not_available',
          message: `A release ${tag} não está disponível (${registered.pipelineState})`,
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

/**
 * Destino do "Voltar à versão anterior": a release de onde veio a troca de versão mais recente
 * do site, ou `null` quando não houve troca, quando a anterior era nula ou quando ela não está
 * `disponivel` — os mesmos casos em que `revertRelease` recusa.
 */
export async function previousRelease(
  db: Executor,
  actor: Actor,
  siteId: string,
): Promise<Result<string | null>> {
  const allowed = requireRole(actor, 'operations.run');
  if (!allowed.ok) return allowed;
  const [site] = await db.select({ id: sites.id }).from(sites).where(eq(sites.id, siteId));
  if (site === undefined) {
    return {
      ok: false,
      issues: [{ code: 'site.not_found', message: `Site ${siteId} não encontrado`, path: [] }],
    };
  }
  const [last] = await db
    .select({ previousRelease: siteEvents.previousRelease })
    .from(siteEvents)
    .where(and(eq(siteEvents.siteId, siteId), eq(siteEvents.kind, 'troca_de_versao')))
    .orderBy(desc(siteEvents.createdAt), desc(siteEvents.id))
    .limit(1);
  if (last?.previousRelease == null) return { ok: true, value: null };
  const [available] = await db
    .select({ tag: releases.tag })
    .from(releases)
    .where(and(eq(releases.tag, last.previousRelease), eq(releases.pipelineState, 'disponivel')));
  return { ok: true, value: available?.tag ?? null };
}

/**
 * "Voltar à versão anterior": troca o site para a release de onde veio a última troca de
 * versão, pelas regras de `rebuildOnRelease` (grava a troca, retoma se pausado, enfileira o
 * build). Como isso grava uma troca nova, voltar de novo alterna entre as duas. Sem anterior
 * válida, recusa sem gravar nada. Devolve a release de destino.
 */
export async function revertRelease(
  tx: Executor,
  actor: Actor,
  siteId: string,
): Promise<Result<string>> {
  const allowed = requireRole(actor, 'operations.run');
  if (!allowed.ok) return allowed;
  // Trava a linha antes de ler a troca: de dois "voltar" simultâneos, o segundo lê a troca
  // que o primeiro gravou.
  await tx.select({ id: sites.id }).from(sites).where(eq(sites.id, siteId)).for('update');
  const previous = await previousRelease(tx, actor, siteId);
  if (!previous.ok) return previous;
  if (previous.value === null) {
    return {
      ok: false,
      issues: [
        {
          code: 'release.no_previous',
          message: `O site ${siteId} não tem versão anterior disponível para voltar`,
          path: [],
        },
      ],
    };
  }
  const rebuilt = await rebuildOnRelease(tx, actor, siteId, previous.value);
  if (!rebuilt.ok) return rebuilt;
  return { ok: true, value: previous.value };
}

/**
 * Site da vez na atualização de todos os sites: passa a `promovendo` na release de destino e
 * grava a `troca_de_versao` em nome de quem iniciou. Quem chama já autorizou (`release.promote`)
 * e conferiu a release; a mudança pendente e o build ficam com ele.
 */
export async function promoteForRollout(
  tx: Executor,
  siteId: string,
  release: string,
  requestedBy: string,
): Promise<void> {
  const [current] = await tx
    .select({ release: sites.release })
    .from(sites)
    .where(eq(sites.id, siteId))
    .for('update');
  if (current === undefined) throw new Error(`Site ${siteId} não encontrado`);
  await tx.update(sites).set({ state: 'promovendo', release }).where(eq(sites.id, siteId));
  await recordSiteEvent(tx, {
    siteId,
    kind: 'troca_de_versao',
    requestedBy,
    previousRelease: current.release,
    release,
  });
}

/**
 * Build da troca de versão publicado: o site da atualização de todos os sites sai de
 * `promovendo` e volta a `ativo`. Site que já saiu de `promovendo` (pausado no meio) fica como está.
 */
export async function finishPromotion(tx: Executor, siteId: string): Promise<void> {
  await tx
    .update(sites)
    .set({ state: 'ativo' })
    .where(and(eq(sites.id, siteId), eq(sites.state, 'promovendo')));
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
 * Desmarca uma etapa manual do ciclo de vida, voltando só à anterior (`zona_ativa →
 * infra_aplicada`, `infra_aplicada → cadastrado`); `publicado` e `cadastrado` não voltam. Quem
 * pede diz qual etapa espera desmarcar: o update condicional decide a corrida, e dois pedidos
 * simultâneos não descem duas etapas. Nenhum estado novo: se o provedor ainda confirmar, a
 * próxima conferência automática marca de novo.
 */
export async function retreatLifecycle(
  tx: Executor,
  actor: Actor,
  siteId: string,
  step: ManualLifecycleStep,
): Promise<Result<void>> {
  const allowed = requireRole(actor, 'site.configure');
  if (!allowed.ok) return allowed;

  const updated = await tx
    .update(sites)
    .set({ lifecycle: MANUAL_STEPS[step] })
    .where(and(eq(sites.id, siteId), eq(sites.lifecycle, step)))
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
        code: 'site.lifecycle_undo_order',
        message: `${step} só pode ser desmarcada com o site em ${step}; o site está em ${site.lifecycle}`,
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

/** Conferência automática da infra (workspace#85): task do backoffice-worker, cron e "Conferir agora". */
export const CHECK_SITE_INFRA_TASK = 'check-site-infra';

/** Etapas em que a conferência ainda tem o que avançar; `zona_ativa` e `publicado` ficam de fora. */
const INFRA_CHECK_STEPS = ['cadastrado', 'infra_aplicada'] as const;

/**
 * Resultado da consulta ao provedor (a forma do `ZoneStatus` de `lib/cloudflare.ts`):
 * `inexistente` não avança, `pendente` avança até `infra_aplicada`, `ativa` até `zona_ativa`;
 * `falha` só grava a mensagem.
 */
export type InfraCheckOutcome =
  | { kind: 'inexistente' }
  | { kind: 'pendente' }
  | { kind: 'ativa' }
  | { kind: 'falha'; message: string };

export type InfraCheckTarget = {
  siteId: string;
  /** Domínio principal (`domains[0]` da configuração corrente); sem ele, não há o que consultar. */
  domain: string | undefined;
};

/**
 * Sites a conferir: os em `cadastrado` ou `infra_aplicada`, todos ou só `siteId` (se ainda
 * estiver numa dessas etapas), com o domínio principal da configuração corrente.
 */
export async function sitesForInfraCheck(
  db: Executor,
  siteId?: string,
): Promise<InfraCheckTarget[]> {
  const rows = await db
    .select({ id: sites.id })
    .from(sites)
    .where(
      and(
        inArray(sites.lifecycle, INFRA_CHECK_STEPS),
        siteId === undefined ? undefined : eq(sites.id, siteId),
      ),
    )
    .orderBy(sites.id);
  const targets: InfraCheckTarget[] = [];
  for (const { id } of rows) {
    const [config] = await db
      .select({ config: siteConfigs.config })
      .from(siteConfigs)
      .where(eq(siteConfigs.siteId, id))
      .orderBy(desc(siteConfigs.version))
      .limit(1);
    targets.push({ siteId: id, domain: config?.config.domains[0] });
  }
  return targets;
}

/**
 * Grava a conferência (quando e, na `falha`, a mensagem; o sucesso limpa a anterior) e avança
 * o ciclo de vida em nome do sistema. O update condicional do `advanceLifecycle` decide a
 * corrida com "Marcar"/"Desmarcar": etapa fora de ordem não é erro, o site só não avança.
 * Devolve a etapa em que o site ficou.
 */
export async function recordInfraCheck(
  tx: Executor,
  siteId: string,
  outcome: InfraCheckOutcome,
  checkedAt: Date,
): Promise<(typeof sites.$inferSelect)['lifecycle'] | undefined> {
  await tx
    .update(sites)
    .set({
      infraCheckedAt: checkedAt,
      infraCheckError: outcome.kind === 'falha' ? outcome.message : null,
    })
    .where(eq(sites.id, siteId));
  if (outcome.kind === 'pendente' || outcome.kind === 'ativa') {
    await advanceLifecycle(tx, SYSTEM_ACTOR, siteId, 'infra_aplicada');
  }
  if (outcome.kind === 'ativa') {
    await advanceLifecycle(tx, SYSTEM_ACTOR, siteId, 'zona_ativa');
  }
  const [site] = await tx
    .select({ lifecycle: sites.lifecycle })
    .from(sites)
    .where(eq(sites.id, siteId));
  return site?.lifecycle;
}

/** `job_key` da conferência de um site: um job por site na fila (`scheduleSiteInfraCheck`). */
export function siteInfraJobKey(siteId: string): string {
  return `site-infra:${siteId}`;
}

/** Etapa em que a conferência ainda tem o que avançar (`cadastrado` ou `infra_aplicada`). */
export function isInfraCheckStep(
  lifecycle: (typeof sites.$inferSelect)['lifecycle'],
): lifecycle is (typeof INFRA_CHECK_STEPS)[number] {
  return (INFRA_CHECK_STEPS as readonly string[]).includes(lifecycle);
}

/**
 * Enfileira a conferência da infra de um site ("Conferir agora"), na transação de quem pede.
 * `job_key` por site com `replace`: pedidos repetidos antes de o job rodar viram um só. Uma
 * tentativa só, como o cron: a próxima conferência é a do cron.
 */
export async function scheduleSiteInfraCheck(tx: Executor, siteId: string): Promise<void> {
  await tx.execute(sql`
    select graphile_worker.add_job(
      identifier => ${CHECK_SITE_INFRA_TASK},
      payload => ${JSON.stringify({ siteId })}::json,
      max_attempts => 1,
      job_key => ${siteInfraJobKey(siteId)},
      job_key_mode => 'replace'
    )`);
}
