'use client';

import { useCallback, useState } from 'react';

import { liveResultText, liveStatusText } from '@/components/shared/siteLabels.ts';
import { usePolling } from '@/components/shared/usePolling.ts';
import Alert from '@/components/ui/Alert';
import type { TypeAttributes } from '@/components/ui/@types/common';
import type { ExecutionHistoryItem, SiteActivity } from '@/domain/builds/builds.ts';

import { SiteBuildsTable } from './SiteBuildsTable.tsx';

/** Leitura do polling (`siteActivityAction` com o site); `null` quando não deu para ler. */
export type SiteActivityStatus = () => Promise<SiteActivity | null>;

/** Intervalo do polling enquanto há execução aberta. */
export const SITE_ACTIVITY_POLL_MS = 3000;

const RESULT_TYPE: Record<ExecutionHistoryItem['status'], TypeAttributes.Status> = {
  ok: 'success',
  failed: 'danger',
  cancelado: 'warning',
};

type Snapshot = { activity: SiteActivity; watched: number | null };

const snapshotOf = (activity: SiteActivity, watched: number | null): Snapshot => ({
  activity,
  watched: activity.open?.id ?? watched,
});

/**
 * Atividade da aba: a da página até o polling trazer outra; quando a página entrega uma nova
 * (depois do `revalidatePath` de uma ação), ela substitui a do polling, como em `ReleasesTable`.
 * `watched` é a última execução vista aberta, para mostrar o resultado dela quando fechar. O
 * polling só roda com execução aberta.
 */
function useSiteActivity(
  activity: SiteActivity,
  status: SiteActivityStatus,
  pollMs: number,
): Snapshot {
  const [source, setSource] = useState(activity);
  const [snapshot, setSnapshot] = useState<Snapshot>(() => snapshotOf(activity, null));
  if (source !== activity) {
    setSource(activity);
    setSnapshot((current) => snapshotOf(activity, current.watched));
  }
  const poll = useCallback(async () => {
    const next = await status();
    if (next !== null) setSnapshot((current) => snapshotOf(next, current.watched));
  }, [status]);
  usePolling(snapshot.activity.open !== null, poll, pollMs);
  return snapshot;
}

function banner(
  { activity, watched }: Snapshot,
  timeZone: string,
): { type: TypeAttributes.Status; text: string } | null {
  if (activity.open !== null)
    return { type: 'info', text: liveStatusText(activity.open, timeZone) };
  const finished = activity.history.find(
    (item): item is ExecutionHistoryItem => item.type === 'execucao' && item.id === watched,
  );
  return finished
    ? { type: RESULT_TYPE[finished.status], text: liveResultText(finished, timeZone) }
    : null;
}

/**
 * Aba "Histórico" com o status ao vivo (#638): no topo, a faixa com a execução aberta ("na
 * fila" com o horário previsto, "em andamento" com a etapa) e, quando ela termina, o resultado;
 * embaixo, o `SiteBuildsTable` com o histórico relido. Enquanto há execução aberta, relê a
 * atividade pela Server Action a cada `pollMs`; sem execução aberta, não consulta. A faixa fica
 * num contêiner `role="status"` sempre montado, para o leitor de tela anunciar cada mudança.
 */
export function SiteLiveActivity({
  activity,
  status,
  timeZone,
  pollMs = SITE_ACTIVITY_POLL_MS,
}: {
  activity: SiteActivity;
  status: SiteActivityStatus;
  timeZone: string;
  pollMs?: number;
}) {
  const snapshot = useSiteActivity(activity, status, pollMs);
  const current = banner(snapshot, timeZone);
  return (
    <div className="space-y-4">
      <div role="status">
        {current && (
          <Alert type={current.type} showIcon duration={0}>
            {current.text}
          </Alert>
        )}
      </div>
      <SiteBuildsTable history={snapshot.activity.history} timeZone={timeZone} />
    </div>
  );
}
