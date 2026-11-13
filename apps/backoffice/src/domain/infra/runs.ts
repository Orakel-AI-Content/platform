// Execuções da infraestrutura do site (`infra_runs`, ADR 0027), de criação, de remoção (`tipo`,
// workspace#97) ou de reaplicação (workspace#98): o pedido e a confirmação, feitos por quem opera
// (a remoção, só pelo admin), e as gravações do infra-runner (resumo do plano, etapa corrente e o
// fechamento), comuns aos três tipos. Cada transição é um update condicional no estado de origem:
// fora de ordem, devolve issue de domínio sem gravar. No `ok`, na mesma transação e em nome de quem
// confirmou, a criação leva o site a `infra_aplicada`, a remoção o devolve a `cadastrado` e a
// reaplicação mantém o lifecycle e marca a infra como em dia. O histórico do site lê daqui
// (`infraActivity`). O lote de reaplicação (`infra_batches`) agrupa execuções `reaplicar`: todos os
// planos antes, uma confirmação para todas e o apply de um site por vez, parando na primeira falha;
// o avanço e a parada acontecem na transação que grava o plano ou fecha a execução.
import type { Issue, Result } from '@orakel/content-model';
import { and, asc, desc, eq, gt, inArray, isNotNull, notExists } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import {
  infraBatches,
  infraRuns,
  OPEN_INFRA_BATCH_STATES,
  OPEN_INFRA_RUN_STATUSES,
  siteConfigs,
  sites,
  type InfraBatchState,
  type InfraRunKind,
  type InfraRunStatus,
  type InfraStep,
} from '../../db/schema/index.ts';
import { requireRole, type Actor } from '../access/rbac.ts';
import { resolveActor } from '../access/users.ts';

import {
  advanceLifecycle,
  INFRA_DRIFT_STEPS,
  recordInfraDrift,
  resetSiteInfra,
} from '../builds/site-state.ts';
import { enqueueRestoreMedia } from '../media/schedule.ts';

type OpenInfraRunStatus = (typeof OPEN_INFRA_RUN_STATUSES)[number];
type ClosedInfraRunStatus = Exclude<InfraRunStatus, OpenInfraRunStatus>;

const refused = (code: string, message: string, path: Issue['path'] = []) => ({
  ok: false as const,
  issues: [{ code, message, path }],
});

const done = { ok: true as const, value: undefined };

/**
 * Pede a criação da infraestrutura: grava a linha `planejando` com quem pediu. Só num site
 * `cadastrado` e sem execução aberta; o índice único parcial decide a corrida entre dois pedidos.
 */
export async function requestInfraRun(
  tx: Executor,
  actor: Actor,
  siteId: string,
): Promise<Result<{ id: number }>> {
  const allowed = requireRole(actor, 'site.configure');
  if (!allowed.ok) return allowed;

  const [site] = await tx
    .select({ lifecycle: sites.lifecycle })
    .from(sites)
    .where(eq(sites.id, siteId));
  if (site === undefined) return refused('site.not_found', `Site ${siteId} não encontrado`);
  if (site.lifecycle !== 'cadastrado') {
    return refused(
      'infra.lifecycle',
      `A infraestrutura só é criada num site cadastrado; o site está em ${site.lifecycle}`,
      ['lifecycle'],
    );
  }

  const [row] = await tx
    .insert(infraRuns)
    .values({ siteId, status: 'planejando', requestedBy: actor.email })
    .onConflictDoNothing()
    .returning({ id: infraRuns.id });
  if (row === undefined) {
    return refused(
      'infra.run_open',
      `O site ${siteId} já tem uma execução de infraestrutura aberta`,
    );
  }
  return { ok: true, value: row };
}

/** Recusa da transição: a execução não existe ou não está no estado de origem. */
async function wrongState(
  tx: Executor,
  runId: number,
  from: readonly InfraRunStatus[],
): Promise<{ ok: false; issues: Issue[] }> {
  const [run] = await tx
    .select({ status: infraRuns.status })
    .from(infraRuns)
    .where(eq(infraRuns.id, runId));
  if (run === undefined) {
    return refused('infra.run_not_found', `Execução de infraestrutura ${runId} não encontrada`);
  }
  return refused(
    'infra.run_state',
    `A execução ${runId} está em ${run.status}; a transição exige ${from.join(' ou ')}`,
    ['status'],
  );
}

/** Grava o resumo do plano: `planejando → aguardando_confirmacao`. */
export async function recordInfraPlan(
  tx: Executor,
  runId: number,
  planSummary: string,
): Promise<Result<void>> {
  const [updated] = await tx
    .update(infraRuns)
    .set({ status: 'aguardando_confirmacao', planSummary })
    .where(and(eq(infraRuns.id, runId), eq(infraRuns.status, 'planejando')))
    .returning({ batchId: infraRuns.batchId });
  if (updated === undefined) return wrongState(tx, runId, ['planejando']);
  if (updated.batchId !== null) await batchPlanned(tx, updated.batchId);
  return done;
}

/** Confirma o plano: `aguardando_confirmacao → aplicando`, com quem confirmou e quando. */
export async function confirmInfraRun(
  tx: Executor,
  actor: Actor,
  runId: number,
): Promise<Result<void>> {
  const allowed = requireRole(actor, 'site.configure');
  if (!allowed.ok) return allowed;

  const updated = await tx
    .update(infraRuns)
    .set({ status: 'aplicando', confirmedBy: actor.email, confirmedAt: new Date() })
    .where(
      and(
        eq(infraRuns.id, runId),
        eq(infraRuns.tipo, 'criar'),
        eq(infraRuns.status, 'aguardando_confirmacao'),
      ),
    )
    .returning({ id: infraRuns.id });
  if (updated.length > 0) return done;
  const kind = await wrongKind(tx, runId, 'criar');
  return kind ?? wrongState(tx, runId, ['aguardando_confirmacao']);
}

const KIND_LABELS = {
  criar: 'criação',
  remover: 'remoção',
  reaplicar: 'reaplicação',
} as const satisfies Record<InfraRunKind, string>;

/** Recusa de uma execução de outro tipo; `undefined` se é do tipo pedido ou não existe. */
async function wrongKind(
  tx: Executor,
  runId: number,
  expected: InfraRunKind,
): Promise<{ ok: false; issues: Issue[] } | undefined> {
  const [run] = await tx
    .select({ tipo: infraRuns.tipo })
    .from(infraRuns)
    .where(eq(infraRuns.id, runId));
  return run === undefined || run.tipo === expected
    ? undefined
    : refused('infra.run_kind', `A execução ${runId} é de ${KIND_LABELS[run.tipo]}`, ['tipo']);
}

/** Recusa da remoção num site que não está pausado; `undefined` se está. */
function notPaused(siteId: string, state: string): { ok: false; issues: Issue[] } | undefined {
  return state === 'pausado'
    ? undefined
    : refused(
        'infra.site_not_paused',
        `A infraestrutura só é removida com o site pausado; o site ${siteId} está ${state}`,
        ['state'],
      );
}

/**
 * Pede a remoção da infraestrutura (workspace#97): grava a linha `remover` em `planejando` com
 * quem pediu. Só o admin (`site.destroy`), num site `pausado` que já passou de `cadastrado`, e sem
 * execução aberta (de criação ou de remoção: o índice único parcial decide a corrida).
 */
export async function requestInfraRemoval(
  tx: Executor,
  actor: Actor,
  siteId: string,
): Promise<Result<{ id: number }>> {
  const allowed = requireRole(actor, 'site.destroy');
  if (!allowed.ok) return allowed;

  const [site] = await tx
    .select({ lifecycle: sites.lifecycle, state: sites.state })
    .from(sites)
    .where(eq(sites.id, siteId));
  if (site === undefined) return refused('site.not_found', `Site ${siteId} não encontrado`);
  const active = notPaused(siteId, site.state);
  if (active !== undefined) return active;
  if (site.lifecycle === 'cadastrado') {
    return refused(
      'infra.lifecycle',
      `O site ${siteId} está cadastrado: não há infraestrutura a remover`,
      ['lifecycle'],
    );
  }

  const [row] = await tx
    .insert(infraRuns)
    .values({ siteId, tipo: 'remover', status: 'planejando', requestedBy: actor.email })
    .onConflictDoNothing()
    .returning({ id: infraRuns.id });
  if (row === undefined) {
    return refused(
      'infra.run_open',
      `O site ${siteId} já tem uma execução de infraestrutura aberta`,
    );
  }
  return { ok: true, value: row };
}

/**
 * Confirma a remoção: `aguardando_confirmacao → aplicando`, com quem confirmou e quando. Só o
 * admin, com o site ainda pausado e o domínio digitado exatamente igual ao principal do site
 * (`domains[0]` da configuração corrente); fora disso, nada é gravado.
 */
export async function confirmInfraRemoval(
  tx: Executor,
  actor: Actor,
  runId: number,
  typedDomain: string,
): Promise<Result<void>> {
  const allowed = requireRole(actor, 'site.destroy');
  if (!allowed.ok) return allowed;

  const [run] = await tx
    .select({ siteId: infraRuns.siteId, state: sites.state })
    .from(infraRuns)
    .innerJoin(sites, eq(sites.id, infraRuns.siteId))
    .where(
      and(
        eq(infraRuns.id, runId),
        eq(infraRuns.tipo, 'remover'),
        eq(infraRuns.status, 'aguardando_confirmacao'),
      ),
    )
    .for('update');
  if (run === undefined) {
    const kind = await wrongKind(tx, runId, 'remover');
    return kind ?? wrongState(tx, runId, ['aguardando_confirmacao']);
  }
  const active = notPaused(run.siteId, run.state);
  if (active !== undefined) return active;

  const [config] = await tx
    .select({ config: siteConfigs.config })
    .from(siteConfigs)
    .where(eq(siteConfigs.siteId, run.siteId))
    .orderBy(desc(siteConfigs.version))
    .limit(1);
  if (config?.config.domains[0] !== typedDomain) {
    return refused(
      'infra.domain_mismatch',
      'O domínio digitado não é o do site; a remoção não foi confirmada',
      ['domain'],
    );
  }

  await tx
    .update(infraRuns)
    .set({ status: 'aplicando', confirmedBy: actor.email, confirmedAt: new Date() })
    .where(eq(infraRuns.id, runId));
  return done;
}

function isDriftStep(
  lifecycle: (typeof sites.$inferSelect)['lifecycle'],
): lifecycle is (typeof INFRA_DRIFT_STEPS)[number] {
  return (INFRA_DRIFT_STEPS as readonly string[]).includes(lifecycle);
}

/**
 * Pede a reaplicação da infraestrutura (workspace#98): grava a linha `reaplicar` em `planejando`
 * com quem pediu. Quem opera (`site.configure`), num site de `infra_aplicada` em diante, pausado
 * ou não, e sem execução aberta (o índice único parcial decide a corrida com criação e remoção).
 * O plano é sempre novo: o resumo confirmado é o plano real.
 */
export async function requestInfraReapply(
  tx: Executor,
  actor: Actor,
  siteId: string,
): Promise<Result<{ id: number }>> {
  const allowed = requireRole(actor, 'site.configure');
  if (!allowed.ok) return allowed;

  const [site] = await tx
    .select({ lifecycle: sites.lifecycle })
    .from(sites)
    .where(eq(sites.id, siteId));
  if (site === undefined) return refused('site.not_found', `Site ${siteId} não encontrado`);
  if (!isDriftStep(site.lifecycle)) {
    return refused(
      'infra.lifecycle',
      `A infraestrutura só é reaplicada depois de aplicada; o site está em ${site.lifecycle}`,
      ['lifecycle'],
    );
  }

  const [row] = await tx
    .insert(infraRuns)
    .values({ siteId, tipo: 'reaplicar', status: 'planejando', requestedBy: actor.email })
    .onConflictDoNothing()
    .returning({ id: infraRuns.id });
  if (row === undefined) {
    return refused(
      'infra.run_open',
      `O site ${siteId} já tem uma execução de infraestrutura aberta`,
    );
  }
  return { ok: true, value: row };
}

/** Confirma a reaplicação: `aguardando_confirmacao → aplicando`, com quem confirmou e quando. */
export async function confirmInfraReapply(
  tx: Executor,
  actor: Actor,
  runId: number,
): Promise<Result<void>> {
  const allowed = requireRole(actor, 'site.configure');
  if (!allowed.ok) return allowed;

  const updated = await tx
    .update(infraRuns)
    .set({ status: 'aplicando', confirmedBy: actor.email, confirmedAt: new Date() })
    .where(
      and(
        eq(infraRuns.id, runId),
        eq(infraRuns.tipo, 'reaplicar'),
        eq(infraRuns.status, 'aguardando_confirmacao'),
      ),
    )
    .returning({ id: infraRuns.id });
  if (updated.length > 0) return done;
  const kind = await wrongKind(tx, runId, 'reaplicar');
  return kind ?? wrongState(tx, runId, ['aguardando_confirmacao']);
}

/** Grava a etapa em andamento, enquanto `aplicando`. */
export async function recordInfraStep(
  tx: Executor,
  runId: number,
  step: InfraStep,
): Promise<Result<void>> {
  const updated = await tx
    .update(infraRuns)
    .set({ currentStep: step })
    .where(and(eq(infraRuns.id, runId), eq(infraRuns.status, 'aplicando')))
    .returning({ id: infraRuns.id });
  return updated.length > 0 ? done : wrongState(tx, runId, ['aplicando']);
}

/** O efeito do `ok` no site, pelo tipo da execução. */
async function applyToSite(
  tx: Executor,
  tipo: InfraRunKind,
  confirmer: Actor,
  siteId: string,
  finishedAt: Date,
): Promise<Result<void>> {
  switch (tipo) {
    case 'criar':
      return advanceLifecycle(tx, confirmer, siteId, 'infra_aplicada');
    case 'remover':
      return resetSiteInfra(tx, confirmer, siteId);
    case 'reaplicar': {
      const allowed = requireRole(confirmer, 'site.configure');
      if (!allowed.ok) return allowed;
      await recordInfraDrift(tx, siteId, { kind: 'em_dia' }, finishedAt);
      return done;
    }
  }
}

/** Desfecho do apply ou do plano. */
export type InfraRunClosing =
  /** `nameservers` da zona criada; a remoção e a reaplicação não os têm e os ignoram. */
  | { status: 'ok'; nameservers?: readonly string[] }
  /** `step` nulo quando a falha foi no plano. */
  | { status: 'falhou'; step: InfraStep | null; message: string };

/** Estados de que cada desfecho parte: o `ok` só do apply; a falha, do plano ou do apply. */
const CLOSING_FROM = {
  ok: ['aplicando'],
  falhou: ['planejando', 'aplicando'],
} as const satisfies Record<InfraRunClosing['status'], readonly OpenInfraRunStatus[]>;

/** Execução de um lote liberada pelo fechamento da anterior, para enfileirar o apply dela. */
export type InfraBatchRun = { siteId: string; runId: number };

/** O que o fechamento libera: a próxima execução do lote, ou `null` (fora de lote, fim ou falha). */
export type InfraRunFinished = { next: InfraBatchRun | null };

/**
 * Fecha a execução. Numa execução de lote, a falha interrompe o lote (`stopInfraBatch`) e o `ok`
 * libera o próximo site (`advanceInfraBatch`), devolvido em `next`. No `ok`, pelo `tipo` gravado e em nome de quem confirmou: a criação grava os
 * nameservers e leva o site a `infra_aplicada` (`advanceLifecycle`); a remoção devolve o site a
 * `cadastrado` (`resetSiteInfra`); a reaplicação mantém o lifecycle e marca a infra como em dia
 * (`recordInfraDrift`). A linha é travada antes, e a recusa do site devolve a issue sem gravar
 * nada. No `falhou`, grava a etapa e o motivo; o lifecycle não muda.
 */
export async function finishInfraRun(
  tx: Executor,
  runId: number,
  closing: InfraRunClosing,
): Promise<Result<InfraRunFinished>> {
  const from = CLOSING_FROM[closing.status];
  const [run] = await tx
    .select({
      siteId: infraRuns.siteId,
      tipo: infraRuns.tipo,
      confirmedBy: infraRuns.confirmedBy,
      batchId: infraRuns.batchId,
      batchPosition: infraRuns.batchPosition,
    })
    .from(infraRuns)
    .where(and(eq(infraRuns.id, runId), inArray(infraRuns.status, from)))
    .for('update');
  if (run === undefined) return wrongState(tx, runId, from);

  const finishedAt = new Date();
  if (closing.status === 'falhou') {
    await tx
      .update(infraRuns)
      .set({
        status: 'falhou',
        currentStep: null,
        failedStep: closing.step,
        failureMessage: closing.message,
        finishedAt,
      })
      .where(eq(infraRuns.id, runId));
    if (run.batchId !== null) await stopInfraBatch(tx, run.batchId, finishedAt);
    return { ok: true, value: { next: null } };
  }

  if (run.confirmedBy === null) {
    return refused('infra.run_unconfirmed', `A execução ${runId} não tem quem a confirmou`);
  }
  const confirmer = await resolveActor(tx, run.confirmedBy);
  if (!confirmer.ok) return confirmer;
  const site = await applyToSite(tx, run.tipo, confirmer.value, run.siteId, finishedAt);
  if (!site.ok) return site;

  const nameservers = run.tipo === 'criar' ? [...(closing.nameservers ?? [])] : null;
  await tx
    .update(infraRuns)
    .set({ status: 'ok', currentStep: null, nameservers, finishedAt })
    .where(eq(infraRuns.id, runId));
  if (run.tipo === 'criar') await enqueueRestoreMedia(tx, run.siteId);
  const next =
    run.batchId !== null && run.batchPosition !== null
      ? await advanceInfraBatch(tx, run.batchId, run.batchPosition, finishedAt)
      : null;
  return { ok: true, value: { next } };
}

/** Criação, remoção ou reaplicação da infraestrutura em andamento, para o status ao vivo. */
export type OpenInfraRun = {
  id: number;
  kind: InfraRunKind;
  status: OpenInfraRunStatus;
  /** Etapa em andamento, enquanto `aplicando`. */
  currentStep: InfraStep | null;
  /** Resumo do plano, a partir de `aguardando_confirmacao`. */
  planSummary: string | null;
  requestedBy: string;
  requestedAt: Date;
  confirmedBy: string | null;
};

/** Item do histórico do site: uma criação, remoção ou reaplicação da infraestrutura que terminou. */
export type InfraHistoryItem = {
  type: 'infra';
  id: number;
  kind: InfraRunKind;
  status: ClosedInfraRunStatus;
  requestedBy: string;
  requestedAt: Date;
  confirmedBy: string | null;
  /** Fim da execução. */
  at: Date;
  /** Só no `ok` de uma criação. */
  nameservers: string[] | null;
  /** Só no `falhou`. */
  failure: { step: InfraStep | null; message: string | null } | null;
};

function isOpen(status: InfraRunStatus): status is OpenInfraRunStatus {
  return (OPEN_INFRA_RUN_STATUSES as readonly InfraRunStatus[]).includes(status);
}

/** A execução aberta do site e as fechadas, da mais recente para a mais antiga, até `limit`. */
export async function infraActivity(
  db: Executor,
  siteId: string,
  limit: number,
): Promise<{ open: OpenInfraRun | null; history: InfraHistoryItem[] }> {
  const [openRow] = await db
    .select()
    .from(infraRuns)
    .where(and(eq(infraRuns.siteId, siteId), inArray(infraRuns.status, OPEN_INFRA_RUN_STATUSES)));
  const open =
    openRow !== undefined && isOpen(openRow.status)
      ? {
          id: openRow.id,
          kind: openRow.tipo,
          status: openRow.status,
          currentStep: openRow.currentStep,
          planSummary: openRow.planSummary,
          requestedBy: openRow.requestedBy,
          requestedAt: openRow.requestedAt,
          confirmedBy: openRow.confirmedBy,
        }
      : null;

  const closed = await db
    .select()
    .from(infraRuns)
    .where(and(eq(infraRuns.siteId, siteId), isNotNull(infraRuns.finishedAt)))
    .orderBy(desc(infraRuns.finishedAt), desc(infraRuns.id))
    .limit(limit);
  const history = closed.flatMap(({ status, finishedAt, ...row }): InfraHistoryItem[] =>
    finishedAt === null || isOpen(status)
      ? []
      : [
          {
            type: 'infra',
            id: row.id,
            kind: row.tipo,
            status,
            requestedBy: row.requestedBy,
            requestedAt: row.requestedAt,
            confirmedBy: row.confirmedBy,
            at: finishedAt,
            nameservers: status === 'ok' ? row.nameservers : null,
            failure:
              status === 'falhou' ? { step: row.failedStep, message: row.failureMessage } : null,
          },
        ],
  );
  return { open, history };
}

/** O que as tasks do build-runner leem da execução: o site, o tipo, o estado e o resumo do plano. */
export async function loadInfraRun(
  db: Executor,
  runId: number,
): Promise<
  | { siteId: string; kind: InfraRunKind; status: InfraRunStatus; planSummary: string | null }
  | undefined
> {
  const [run] = await db
    .select({
      siteId: infraRuns.siteId,
      kind: infraRuns.tipo,
      status: infraRuns.status,
      planSummary: infraRuns.planSummary,
    })
    .from(infraRuns)
    .where(eq(infraRuns.id, runId));
  return run;
}

const batchRefused = (batchId: number, state: InfraBatchState, expected: InfraBatchState) =>
  refused(
    'infra.batch_state',
    `O lote ${batchId} está em ${state}; a transição exige ${expected}`,
    ['state'],
  );

/**
 * Pede o lote "reaplicar em todos os desatualizados": uma execução `reaplicar` em `planejando`
 * por site marcado `desatualizado`, de `infra_aplicada` em diante e sem execução aberta (esse já
 * está sendo tratado), na ordem do id do site. Quem opera (`site.configure`). Recusa sem gravar
 * nada se já há um lote aberto ou se não há site a reaplicar. Devolve as execuções criadas, na
 * ordem, para enfileirar os planos.
 */
export async function requestInfraBatch(
  tx: Executor,
  actor: Actor,
): Promise<Result<{ id: number; runs: InfraBatchRun[] }>> {
  const allowed = requireRole(actor, 'site.configure');
  if (!allowed.ok) return allowed;

  const [open] = await tx
    .select({ id: infraBatches.id })
    .from(infraBatches)
    .where(inArray(infraBatches.state, OPEN_INFRA_BATCH_STATES));
  if (open !== undefined) {
    return refused('infra.batch_open', `O lote ${open.id} de reaplicação ainda está aberto`);
  }

  const outdated = await tx
    .select({ id: sites.id })
    .from(sites)
    .where(
      and(
        eq(sites.infraDriftStatus, 'desatualizado'),
        inArray(sites.lifecycle, INFRA_DRIFT_STEPS),
        notExists(
          tx
            .select({ id: infraRuns.id })
            .from(infraRuns)
            .where(
              and(
                eq(infraRuns.siteId, sites.id),
                inArray(infraRuns.status, OPEN_INFRA_RUN_STATUSES),
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(sites.id))
    .for('update');
  if (outdated.length === 0) {
    return refused('infra.batch_empty', 'Nenhum site está com a infraestrutura desatualizada');
  }

  const [batch] = await tx
    .insert(infraBatches)
    .values({ requestedBy: actor.email })
    .onConflictDoNothing()
    .returning({ id: infraBatches.id });
  if (batch === undefined) {
    return refused('infra.batch_open', 'Já há um lote de reaplicação aberto');
  }

  const runs = await tx
    .insert(infraRuns)
    .values(
      outdated.map((site, position) => ({
        siteId: site.id,
        tipo: 'reaplicar' as const,
        status: 'planejando' as const,
        requestedBy: actor.email,
        batchId: batch.id,
        batchPosition: position,
      })),
    )
    .returning({
      siteId: infraRuns.siteId,
      runId: infraRuns.id,
      position: infraRuns.batchPosition,
    });
  runs.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  return {
    ok: true,
    value: { id: batch.id, runs: runs.map(({ siteId, runId }) => ({ siteId, runId })) },
  };
}

/** Trava o lote aberto até o fim da transação; `undefined` se não existe ou já fechou. */
async function lockOpenBatch(tx: Executor, batchId: number) {
  const [batch] = await tx
    .select({ id: infraBatches.id, state: infraBatches.state })
    .from(infraBatches)
    .where(and(eq(infraBatches.id, batchId), inArray(infraBatches.state, OPEN_INFRA_BATCH_STATES)))
    .for('update');
  return batch;
}

/** Com o último plano gravado, o lote passa de `planejando` a `aguardando_confirmacao`. */
async function batchPlanned(tx: Executor, batchId: number): Promise<void> {
  const batch = await lockOpenBatch(tx, batchId);
  if (batch?.state !== 'planejando') return;
  const [pending] = await tx
    .select({ id: infraRuns.id })
    .from(infraRuns)
    .where(and(eq(infraRuns.batchId, batchId), eq(infraRuns.status, 'planejando')))
    .limit(1);
  if (pending !== undefined) return;
  await tx
    .update(infraBatches)
    .set({ state: 'aguardando_confirmacao' })
    .where(eq(infraBatches.id, batchId));
}

/**
 * Confirma o lote: uma confirmação vale para todas as execuções, que recebem quem confirmou e
 * quando. Só a primeira (posição 0) vai a `aplicando`; as demais esperam a vez em
 * `aguardando_confirmacao`, já confirmadas. O lote vai a `aplicando`. Devolve a execução liberada,
 * para enfileirar o apply. Só com o lote em `aguardando_confirmacao` (todos os planos gravados).
 */
export async function confirmInfraBatch(
  tx: Executor,
  actor: Actor,
  batchId: number,
): Promise<Result<InfraBatchRun>> {
  const allowed = requireRole(actor, 'site.configure');
  if (!allowed.ok) return allowed;

  const [batch] = await tx
    .select({ state: infraBatches.state })
    .from(infraBatches)
    .where(eq(infraBatches.id, batchId))
    .for('update');
  if (batch === undefined) {
    return refused('infra.batch_not_found', `Lote de reaplicação ${batchId} não encontrado`);
  }
  if (batch.state !== 'aguardando_confirmacao') {
    return batchRefused(batchId, batch.state, 'aguardando_confirmacao');
  }

  const confirmedAt = new Date();
  await tx
    .update(infraRuns)
    .set({ confirmedBy: actor.email, confirmedAt })
    .where(and(eq(infraRuns.batchId, batchId), eq(infraRuns.status, 'aguardando_confirmacao')));
  const [first] = await tx
    .update(infraRuns)
    .set({ status: 'aplicando' })
    .where(
      and(
        eq(infraRuns.batchId, batchId),
        eq(infraRuns.batchPosition, 0),
        eq(infraRuns.status, 'aguardando_confirmacao'),
      ),
    )
    .returning({ siteId: infraRuns.siteId, runId: infraRuns.id });
  if (first === undefined) {
    throw new Error(`Lote ${batchId} em aguardando_confirmacao sem a execução da posição 0`);
  }
  await tx.update(infraBatches).set({ state: 'aplicando' }).where(eq(infraBatches.id, batchId));
  return { ok: true, value: first };
}

/**
 * O `ok` de um site do lote: o próximo na ordem vai a `aplicando` e é devolvido; sem próximo, o
 * lote fecha `concluido`.
 */
async function advanceInfraBatch(
  tx: Executor,
  batchId: number,
  position: number,
  now: Date,
): Promise<InfraBatchRun | null> {
  const batch = await lockOpenBatch(tx, batchId);
  if (batch?.state !== 'aplicando') return null;

  const [next] = await tx
    .select({ id: infraRuns.id })
    .from(infraRuns)
    .where(
      and(
        eq(infraRuns.batchId, batchId),
        gt(infraRuns.batchPosition, position),
        eq(infraRuns.status, 'aguardando_confirmacao'),
      ),
    )
    .orderBy(asc(infraRuns.batchPosition))
    .limit(1);
  if (next === undefined) {
    await tx
      .update(infraBatches)
      .set({ state: 'concluido', finishedAt: now })
      .where(eq(infraBatches.id, batchId));
    return null;
  }
  const [released] = await tx
    .update(infraRuns)
    .set({ status: 'aplicando' })
    .where(eq(infraRuns.id, next.id))
    .returning({ siteId: infraRuns.siteId, runId: infraRuns.id });
  return released ?? null;
}

/**
 * A falha de um site do lote (no plano ou no apply): as execuções ainda abertas fecham `cancelado`,
 * sem apply, e o lote fecha `interrompido`. Os sites cancelados continuam desatualizados.
 */
async function stopInfraBatch(tx: Executor, batchId: number, now: Date): Promise<void> {
  const batch = await lockOpenBatch(tx, batchId);
  if (batch === undefined) return;
  await tx
    .update(infraRuns)
    .set({ status: 'cancelado', currentStep: null, finishedAt: now })
    .where(and(eq(infraRuns.batchId, batchId), inArray(infraRuns.status, OPEN_INFRA_RUN_STATUSES)));
  await tx
    .update(infraBatches)
    .set({ state: 'interrompido', finishedAt: now })
    .where(eq(infraBatches.id, batchId));
}

/** Um site do lote, na ordem: o estado da execução e, no que falhou, a etapa e o motivo. */
export type InfraBatchSite = {
  siteId: string;
  runId: number;
  position: number;
  status: InfraRunStatus;
  /** Etapa em andamento, enquanto `aplicando`. */
  currentStep: InfraStep | null;
  planSummary: string | null;
  /** Só no `falhou`. */
  failure: { step: InfraStep | null; message: string | null } | null;
};

export type InfraBatch = {
  id: number;
  state: InfraBatchState;
  requestedBy: string;
  startedAt: Date;
  finishedAt: Date | null;
  sites: InfraBatchSite[];
};

/** O lote mais recente com o progresso de cada site, ou `null` sem nenhum. Quem opera. */
export async function latestInfraBatch(
  db: Executor,
  actor: Actor,
): Promise<Result<InfraBatch | null>> {
  const allowed = requireRole(actor, 'site.configure');
  if (!allowed.ok) return allowed;

  const [batch] = await db
    .select()
    .from(infraBatches)
    .orderBy(desc(infraBatches.startedAt), desc(infraBatches.id))
    .limit(1);
  if (batch === undefined) return { ok: true, value: null };

  const rows = await db
    .select()
    .from(infraRuns)
    .where(eq(infraRuns.batchId, batch.id))
    .orderBy(asc(infraRuns.batchPosition));
  const batchSites = rows.map((row): InfraBatchSite => ({
    siteId: row.siteId,
    runId: row.id,
    position: row.batchPosition ?? 0,
    status: row.status,
    currentStep: row.currentStep,
    planSummary: row.planSummary,
    failure: row.status === 'falhou' ? { step: row.failedStep, message: row.failureMessage } : null,
  }));
  return { ok: true, value: { ...batch, sites: batchSites } };
}
