// "Atualizar todos os sites" (workspace#83): leva a release `disponivel` mais recente a todos os
// sites, um por vez, começando pelo de menor audiência (canário). A atualização é um registro
// próprio (`release_rollouts` e seus sites), não deduzida de `sites.state`. Aqui: iniciar, que
// grava o registro e promove o primeiro site, e a leitura do progresso. Avançar quando o build
// termina e interromper ficam nas Tasks seguintes. Toda escrita em `sites` passa por
// `site-state.ts`.
import type { Result } from '@orakel/content-model';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import {
  audienceDailySite,
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
import { promoteForRollout } from '../builds/site-state.ts';
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

  await promoteForRollout(tx, first.siteId, target, actor.email);
  await recordPendingChange(tx, first.siteId, 'release', target);
  await buildNow(tx, first.siteId, actor.email, now);

  return { ok: true, value: { ...rollout, sites: ordered } };
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
