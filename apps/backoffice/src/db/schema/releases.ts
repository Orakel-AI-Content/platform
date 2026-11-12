import { sql } from 'drizzle-orm';
import {
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { sites } from './sites.ts';

/** Resultado da conferência da imagem site-builder:X.Y.Z no host (valores em português). */
export const RELEASE_IMAGE_STATUSES = ['disponivel', 'ausente'] as const;

/**
 * Estado do pipeline que gera a release: `gerando` (CI do release.yml), `baixando` (pull da
 * imagem no host), `disponivel`, `falhou` (com o motivo) e `descartada`.
 */
export const RELEASE_PIPELINE_STATES = [
  'gerando',
  'baixando',
  'disponivel',
  'falhou',
  'descartada',
] as const;

/**
 * Versões do site-builder registradas pela operação (L1): a tag (X.Y.Z) é a tag da imagem
 * site-builder, publicada pela tag Git site-builder-vX.Y.Z, e o valor de `sites.release` e
 * `builds.release`. Operacional: fora do
 * snapshot, sem mudança pendente.
 *
 * `imageStatus` e `imageCheckedAt` guardam a última conferência da imagem no host, feita pelo
 * build-runner (job `check-release-image`); as duas nulas = ainda não conferida.
 *
 * `pipelineState` nasce `disponivel` nas linhas cadastradas à mão (já publicadas); as pedidas
 * por "Gerar nova versão" nascem `gerando`, com `requestedBy` (e-mail). `runId` e `runUrl` são
 * do run do GitHub (o id passa de 32 bits e não entra em conta: texto); `failureReason`
 * acompanha `falhou`.
 */
export const releases = pgTable('releases', {
  tag: text().primaryKey(),
  registeredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  imageStatus: text({ enum: RELEASE_IMAGE_STATUSES }),
  imageCheckedAt: timestamp({ withTimezone: true }),
  pipelineState: text({ enum: RELEASE_PIPELINE_STATES }).notNull().default('disponivel'),
  runId: text(),
  runUrl: text(),
  failureReason: text(),
  requestedBy: text(),
});

/**
 * Estado da atualização de todos os sites: `em_andamento` enquanto há site por atualizar;
 * `concluida`, `falhou` (um site falhou e a atualização parou) e `interrompida` (quem opera
 * parou) são finais.
 */
export const RELEASE_ROLLOUT_STATES = [
  'em_andamento',
  'concluida',
  'falhou',
  'interrompida',
] as const;

/**
 * Estado de cada site na atualização: `aguardando` a vez, `em_andamento` (promovido, à espera
 * do build), `atualizado`, `falhou` e `nao_atualizado` (pausado, fica de fora).
 */
export const RELEASE_ROLLOUT_SITE_STATES = [
  'aguardando',
  'em_andamento',
  'atualizado',
  'falhou',
  'nao_atualizado',
] as const;

/**
 * "Atualizar todos os sites" (workspace#83): leva a release de destino a todos os sites, um por
 * vez, começando pelo primeiro da ordem (canário). Operacional: fora do snapshot. Só uma
 * `em_andamento` por vez (índice único parcial). `finishedAt` nulo enquanto aberta.
 */
export const releaseRollouts = pgTable(
  'release_rollouts',
  {
    id: serial().primaryKey(),
    targetRelease: text()
      .notNull()
      .references(() => releases.tag),
    state: text({ enum: RELEASE_ROLLOUT_STATES }).notNull().default('em_andamento'),
    /** E-mail de quem iniciou. */
    requestedBy: text().notNull(),
    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex('release_rollouts_open_unique')
      .on(t.state)
      .where(sql`${t.state} = 'em_andamento'`),
  ],
);

/**
 * Os sites de uma atualização, na ordem em que são atualizados (`position`, de 0): audiência
 * crescente dos últimos 30 dias, empate pelo id. `previousRelease` é a release do site no início.
 */
export const releaseRolloutSites = pgTable(
  'release_rollout_sites',
  {
    rolloutId: integer()
      .notNull()
      .references(() => releaseRollouts.id),
    siteId: text()
      .notNull()
      .references(() => sites.id),
    position: integer().notNull(),
    state: text({ enum: RELEASE_ROLLOUT_SITE_STATES }).notNull(),
    previousRelease: text(),
  },
  (t) => [
    primaryKey({ columns: [t.rolloutId, t.siteId] }),
    unique('release_rollout_sites_position_unique').on(t.rolloutId, t.position),
  ],
);
