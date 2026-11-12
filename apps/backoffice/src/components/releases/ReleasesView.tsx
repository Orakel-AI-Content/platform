'use client';

import type { ReactNode } from 'react';

import { ListHeader } from '@/components/shared/PageHeader';

import { ReleasesTable, type ReleaseAction } from './ReleasesTable.tsx';
import { RolloutButton, RolloutCard, type StartRollout } from './RolloutCard.tsx';
import {
  useReleasesSnapshot,
  type ReleasesSnapshot,
  type ReleasesStatus,
} from './useReleasesSnapshot.ts';

/**
 * Corpo da tela de Releases (#703): um só polling (`useReleasesSnapshot`) alimenta o botão
 * "Atualizar todos os sites", que reabilita sozinho quando a atualização fecha, o cartão de
 * progresso da última atualização, acima da tabela, e a tabela. Fica dentro do `AdaptiveCard` da
 * página, no esboço aprovado no refinamento de workspace#83.
 */
export function ReleasesView({
  snapshot: initial,
  generate,
  startRollout,
  retry,
  discard,
  status,
  pollMs,
  titleId,
}: {
  snapshot: ReleasesSnapshot;
  /** "Gerar nova versão", também repetido no estado vazio da tabela. */
  generate: ReactNode;
  startRollout: StartRollout;
  retry: ReleaseAction;
  discard: ReleaseAction;
  /** Leitura do polling; sem ela, a tela não se atualiza sozinha. */
  status?: ReleasesStatus;
  pollMs?: number;
  titleId: string;
}) {
  const snapshot = useReleasesSnapshot(initial, status, pollMs);
  const { rollout } = snapshot;
  return (
    <div className="flex flex-col gap-4">
      <ListHeader
        id={titleId}
        title="Releases"
        action={
          <>
            <RolloutButton
              target={snapshot.rolloutTarget}
              running={rollout?.state === 'em_andamento'}
              action={startRollout}
            />
            {generate}
          </>
        }
      />
      {rollout !== null && <RolloutCard rollout={rollout} />}
      <ReleasesTable
        rows={snapshot.rows}
        inUse={snapshot.inUse}
        preview={snapshot.preview}
        retry={retry}
        discard={discard}
        emptyAction={generate}
        labelledBy={titleId}
      />
    </div>
  );
}
