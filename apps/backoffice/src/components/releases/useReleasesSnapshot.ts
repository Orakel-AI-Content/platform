'use client';

import { useCallback, useState } from 'react';

import { usePolling } from '@/components/shared/usePolling.ts';
import type { PreviewState } from '@/domain/preview/preview.ts';
import type { ReleasePipelineState, ReleaseRecord } from '@/domain/releases/releases.ts';
import type { Rollout } from '@/domain/releases/rollout.ts';

/**
 * Releases, as tags que algum site usa, o estado da prévia, a última atualização de todos os
 * sites e a versão que uma nova levaria (a `disponivel` mais recente): o que a página carrega e
 * o polling relê.
 */
export type ReleasesSnapshot = {
  rows: ReleaseRecord[];
  inUse: string[];
  preview: PreviewState;
  rollout: Rollout | null;
  rolloutTarget: string | null;
};

/** Leitura do polling; `undefined` quando não deu para ler (o próximo tique tenta de novo). */
export type ReleasesStatus = () => Promise<ReleasesSnapshot | undefined>;

/**
 * Intervalo do polling enquanto alguma release está no pipeline, a prévia está atualizando ou a
 * atualização de todos os sites está em andamento.
 */
export const RELEASES_POLL_MS = 3000;

/** Estados em que o pipeline anda sozinho: só com algum deles a lista se atualiza. */
const IN_PIPELINE: ReadonlySet<ReleasePipelineState> = new Set(['gerando', 'baixando']);

/** Algo na tela anda sozinho: o polling só roda enquanto isso vale. */
export function isMoving(snapshot: ReleasesSnapshot): boolean {
  return (
    snapshot.preview.status === 'atualizando' ||
    snapshot.rollout?.state === 'em_andamento' ||
    snapshot.rows.some((release) => IN_PIPELINE.has(release.pipelineState))
  );
}

/**
 * Um só polling para a tela de Releases (#703): o botão "Atualizar todos os sites", o cartão de
 * progresso e a tabela leem o mesmo snapshot. Começa no da página e segue o polling enquanto algo
 * anda sozinho (`isMoving`). Quando a página entrega dados novos (depois do `revalidatePath` de
 * uma ação), eles substituem os do polling.
 */
export function useReleasesSnapshot(
  initial: ReleasesSnapshot,
  status: ReleasesStatus | undefined,
  pollMs: number = RELEASES_POLL_MS,
): ReleasesSnapshot {
  const [source, setSource] = useState(initial);
  const [snapshot, setSnapshot] = useState(initial);
  if (source !== initial) {
    setSource(initial);
    setSnapshot(initial);
  }
  const poll = useCallback(async () => {
    const next = await status?.();
    if (next !== undefined) setSnapshot(next);
  }, [status]);
  usePolling(status !== undefined && isMoving(snapshot), poll, pollMs);
  return snapshot;
}
