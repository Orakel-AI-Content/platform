// "Atualizar todos os sites" (workspace#83): leva a release `disponivel` mais recente a todos os
// sites, um por vez, começando pelo de menor audiência (canário). A atualização é um registro
// próprio (`release_rollouts` e seus sites), não deduzida de `sites.state`. Aqui: iniciar, que
// grava o registro e promove o primeiro site; avançar, na transação que fecha o build do site
// em andamento; e a leitura do progresso. Interromper fica na Task seguinte. Toda escrita em
// `sites` passa por `site-state.ts`.
import type { Result } from '@orakel/content-model';
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import {
  audienceDailySite,
  builds,
  pendingChanges,
  releaseRollouts,
  releaseRolloutSites,
  sites,
} from '../../db/schema/index.ts';
import type {
  RELEASE_ROLLOUT_SITE_STATES,
  RELEASE_ROLLOUT_STATES,
} from '../../db/schema/releases.ts';
import { requireRole, type Actor } from '../access/rbac.ts';
import { audiencePeriodWindow } from '../audience/read.ts';
import type { BuildOutcome } from '../builds/run-build.ts';
import { finishPromotion, pauseSite, promoteForRollout } from '../builds/site-state.ts';
import { buildNow } from '../builds/schedule.ts';
import { recordPendingChange } from '../pending-changes/record.ts';
import { latestAvailableRelease } from './releases.ts';

export type RolloutState = (typeof RELEASE_ROLLOUT_STATES)[number];
export type RolloutSiteState = (typeof RELEASE_ROLLOUT_SITE_STATES)[number];

/** Um site da atualização; `previousRelease` é a release dele no início. */
export type RolloutSite = {
  siteId: string;
  position: number;
  state: RolloutSiteState;
  previousRelease: string | null;
};

/** A atualização com os sites na ordem em que são atualizados. */
export type Rollout = {
  id: number;
  targetRelease: string;
  state: RolloutState;
  requestedBy: string;
  startedAt: Date;
  finishedAt: Date | null;
  sites: RolloutSite[];
};

/** Janela de audiência que ordena os sites, em dias de America/Sao_Paulo até hoje. */
const AUDIENCE_DAYS = 30;

const rejected = (code: string, message: string): Result<never> => ({
  ok: false,
  issues: [{ code, message, path: [] }],
});

const alreadyOpen = (): Result<never> =>
  rejected('rollout.already_open', 'Já existe uma atualização de todos os sites em andamento');

/**
 * Os sites na ordem da atualização: visualizações crescentes nos últimos 30 dias (sem dados =
 * 0), empate pelo id. Trava as linhas dos sites até o fim da transação: pausar ou trocar a versão
 * de um site no meio do início espera.
 */
async function sitesByAudience(
  tx: Executor,
  now: Date,
): Promise<{ id: string; state: string; release: string | null }[]> {
  const rows = await tx
    .select({ id: sites.id, state: sites.state, release: sites.release })
    .from(sites)
    .orderBy(asc(sites.id))
    .for('update');
  const window = audiencePeriodWindow(AUDIENCE_DAYS, now);
  const audience = await tx
    .select({
      siteId: audienceDailySite.siteId,
      views: sql<number>`sum(${audienceDailySite.views})::int`,
    })
    .from(audienceDailySite)
    .where(and(gte(audienceDailySite.day, window.from), lte(audienceDailySite.day, window.to)))
    .groupBy(audienceDailySite.siteId);
  const views = new Map(audience.map((row) => [row.siteId, row.views]));
  const viewsOf = (id: string): number => views.get(id) ?? 0;
  return rows.toSorted(
    (a, b) => viewsOf(a.id) - viewsOf(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/**
 * Inicia a atualização de todos os sites: destino na release `disponivel` mais recente, sites
 * na ordem de audiência. Pausado entra `nao_atualizado`; já no destino, `atualizado` (sem build);
 * os demais, `aguardando`. O primeiro aguardando fica `em_andamento`: o site vai a `promovendo`
 * na release de destino, com mudança pendente `release` e build imediato. Recusa sem gravar
 * nada quando já há uma em andamento, sem release `disponivel` ou sem site a atualizar.
 */
export async function startRollout(
  tx: Executor,
  actor: Actor,
  now: Date = new Date(),
): Promise<Result<Rollout>> {
  const allowed = requireRole(actor, 'release.promote');
  if (!allowed.ok) return allowed;

  const [open] = await tx
    .select({ id: releaseRollouts.id })
    .from(releaseRollouts)
    .where(eq(releaseRollouts.state, 'em_andamento'));
  if (open !== undefined) return alreadyOpen();

  const target = await latestAvailableRelease(tx);
  if (target === null) {
    return rejected('rollout.no_release', 'Não há release disponível para levar aos sites');
  }

  const ordered = (await sitesByAudience(tx, now)).map((site, position): RolloutSite => ({
    siteId: site.id,
    position,
    previousRelease: site.release,
    state:
      site.state === 'pausado'
        ? 'nao_atualizado'
        : site.release === target
          ? 'atualizado'
          : 'aguardando',
  }));
  const first = ordered.find((site) => site.state === 'aguardando');
  if (first === undefined) {
    return rejected(
      'rollout.nothing_to_update',
      `Nenhum site a atualizar para a ${target}: todos já estão nela ou pausados`,
    );
  }
  first.state = 'em_andamento';

  // De dois inícios simultâneos, o índice único parcial deixa passar um; o outro não grava nada.
  const [rollout] = await tx
    .insert(releaseRollouts)
    .values({ targetRelease: target, requestedBy: actor.email, startedAt: now })
    .onConflictDoNothing()
    .returning();
  if (rollout === undefined) return alreadyOpen();

  await tx
    .insert(releaseRolloutSites)
    .values(ordered.map((site) => ({ rolloutId: rollout.id, ...site })));

  await promoteSite(tx, first.siteId, target, actor.email, now);

  return { ok: true, value: { ...rollout, sites: ordered } };
}

/** O site da vez vai a `promovendo` na release de destino, com mudança pendente e build já. */
async function promoteSite(
  tx: Executor,
  siteId: string,
  target: string,
  requestedBy: string,
  now: Date,
): Promise<void> {
  await promoteForRollout(tx, siteId, target, requestedBy);
  await recordPendingChange(tx, siteId, 'release', target);
  await buildNow(tx, siteId, requestedBy, now);
}

/** A tentativa de build que acabou de fechar, como o avanço da atualização a vê. */
export type ClosedBuild = {
  buildId: number;
  siteId: string;
  outcome: BuildOutcome;
  /** Última tentativa do job: a falha transitória não volta a rodar. */
  lastAttempt: boolean;
};

/**
 * O build é o da troca de versão do site em andamento: no sucesso, ele levou a mudança pendente
 * `release` do destino; na falha (o render pode nem ter listado as mudanças), foi feito na
 * release de destino com essa mudança ainda pendente.
 */
async function isRolloutBuild(tx: Executor, build: ClosedBuild, target: string): Promise<boolean> {
  const release = and(
    eq(pendingChanges.siteId, build.siteId),
    eq(pendingChanges.origin, 'release'),
    eq(pendingChanges.reference, target),
  );
  if (build.outcome.status === 'ok') {
    const ids = build.outcome.render.pendingChangeIds;
    if (ids.length === 0) return false;
    const [change] = await tx
      .select({ id: pendingChanges.id })
      .from(pendingChanges)
      .where(and(release, inArray(pendingChanges.id, ids)))
      .limit(1);
    return change !== undefined;
  }
  const [row] = await tx
    .select({ release: builds.release })
    .from(builds)
    .where(eq(builds.id, build.buildId));
  if (row?.release !== target) return false;
  const [pending] = await tx
    .select({ id: pendingChanges.id })
    .from(pendingChanges)
    .where(and(release, isNull(pendingChanges.resolvedAt)))
    .limit(1);
  return pending !== undefined;
}

/**
 * Promove o próximo site `aguardando`, na ordem; o que estiver pausado quando chega a vez fica
 * `nao_atualizado` e o avanço segue. Sem próximo, a atualização fecha `concluida`.
 */
async function promoteNext(
  tx: Executor,
  rollout: { id: number; targetRelease: string; requestedBy: string },
  now: Date,
): Promise<void> {
  const waiting = await tx
    .select({ siteId: releaseRolloutSites.siteId })
    .from(releaseRolloutSites)
    .where(
      and(
        eq(releaseRolloutSites.rolloutId, rollout.id),
        eq(releaseRolloutSites.state, 'aguardando'),
      ),
    )
    .orderBy(asc(releaseRolloutSites.position));
  const setSite = (siteId: string, state: RolloutSiteState) =>
    tx
      .update(releaseRolloutSites)
      .set({ state })
      .where(
        and(eq(releaseRolloutSites.rolloutId, rollout.id), eq(releaseRolloutSites.siteId, siteId)),
      );
  for (const { siteId } of waiting) {
    // Trava a linha do site: pausar no meio do avanço espera a decisão.
    const [site] = await tx
      .select({ state: sites.state })
      .from(sites)
      .where(eq(sites.id, siteId))
      .for('update');
    if (site === undefined || site.state === 'pausado') {
      await setSite(siteId, 'nao_atualizado');
      continue;
    }
    await setSite(siteId, 'em_andamento');
    await promoteSite(tx, siteId, rollout.targetRelease, rollout.requestedBy, now);
    return;
  }
  await tx
    .update(releaseRollouts)
    .set({ state: 'concluida', finishedAt: now })
    .where(eq(releaseRollouts.id, rollout.id));
}

/**
 * Avança a atualização de todos os sites na transação que fecha o build (`recordBuild`). Só age
 * no build da troca de versão do site `em_andamento`. Sucesso: o site fica `atualizado`, volta a
 * `ativo`, e o próximo começa (ou a atualização fecha `concluida`). Falha permanente, ou
 * transitória na última tentativa: o site fica `falhou`, pausado na versão nova, e a atualização
 * fecha `falhou`, sem promover mais nenhum. Transitória com nova tentativa e cancelado não mudam
 * nada. Atualização que já não está `em_andamento` (interrompida) só registra o site em andamento.
 */
export async function advanceRollout(
  tx: Executor,
  build: ClosedBuild,
  now: Date = new Date(),
): Promise<void> {
  const { outcome } = build;
  if (outcome.status === 'cancelled') return;
  if (outcome.status === 'failed' && outcome.failure.kind === 'transient' && !build.lastAttempt) {
    return;
  }

  const [current] = await tx
    .select({ rolloutId: releaseRolloutSites.rolloutId })
    .from(releaseRolloutSites)
    .where(
      and(
        eq(releaseRolloutSites.siteId, build.siteId),
        eq(releaseRolloutSites.state, 'em_andamento'),
      ),
    )
    .orderBy(desc(releaseRolloutSites.rolloutId))
    .limit(1);
  if (current === undefined) return;
  // Trava a atualização: interromper ao mesmo tempo espera o avanço terminar.
  const [rollout] = await tx
    .select()
    .from(releaseRollouts)
    .where(eq(releaseRollouts.id, current.rolloutId))
    .for('update');
  if (rollout === undefined) return;
  if (!(await isRolloutBuild(tx, build, rollout.targetRelease))) return;

  const ok = outcome.status === 'ok';
  await tx
    .update(releaseRolloutSites)
    .set({ state: ok ? 'atualizado' : 'falhou' })
    .where(
      and(
        eq(releaseRolloutSites.rolloutId, rollout.id),
        eq(releaseRolloutSites.siteId, build.siteId),
      ),
    );
  if (ok) {
    await finishPromotion(tx, build.siteId);
  } else if (outcome.status === 'failed' && outcome.failure.kind === 'transient') {
    // A permanente já pausou o site em `recordBuild`; a transitória da última tentativa também.
    await pauseSite(
      tx,
      build.siteId,
      `${outcome.stage}: ${outcome.failure.message}`,
      outcome.failure.culprit,
    );
  }
  if (rollout.state !== 'em_andamento') return;

  if (ok) {
    await promoteNext(tx, rollout, now);
  } else {
    await tx
      .update(releaseRollouts)
      .set({ state: 'falhou', finishedAt: now })
      .where(eq(releaseRollouts.id, rollout.id));
  }
}

/** A atualização mais recente com o estado de cada site, ou `null` sem nenhuma. */
export async function latestRollout(db: Executor, actor: Actor): Promise<Result<Rollout | null>> {
  const allowed = requireRole(actor, 'release.promote');
  if (!allowed.ok) return allowed;

  const [rollout] = await db
    .select()
    .from(releaseRollouts)
    .orderBy(desc(releaseRollouts.startedAt), desc(releaseRollouts.id))
    .limit(1);
  if (rollout === undefined) return { ok: true, value: null };

  const rows = await db
    .select({
      siteId: releaseRolloutSites.siteId,
      position: releaseRolloutSites.position,
      state: releaseRolloutSites.state,
      previousRelease: releaseRolloutSites.previousRelease,
    })
    .from(releaseRolloutSites)
    .where(eq(releaseRolloutSites.rolloutId, rollout.id))
    .orderBy(asc(releaseRolloutSites.position));
  return { ok: true, value: { ...rollout, sites: rows } };
}
