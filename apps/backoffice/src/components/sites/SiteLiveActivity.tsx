'use client';

import { useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useState } from 'react';

import {
  infraLiveResultText,
  infraLiveStatusText,
  liveResultText,
  liveStatusText,
} from '@/components/shared/siteLabels.ts';
import { usePolling } from '@/components/shared/usePolling.ts';
import Alert from '@/components/ui/Alert';
import type { TypeAttributes } from '@/components/ui/@types/common';
import type { ExecutionHistoryItem, SiteActivity } from '@/domain/builds/builds.ts';
import type { InfraHistoryItem, OpenInfraRun } from '@/domain/infra/runs.ts';

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

type Snapshot = {
  activity: SiteActivity;
  /** A última execução de build vista aberta. */
  watched: number | null;
  /**
   * A última criação da infraestrutura vista aberta (#826), em qualquer estado: o apply do
   * driver local termina antes de a página revalidada chegar, e a aba nunca a veria aplicando.
   */
  watchedInfra: number | null;
};

/** A criação da infraestrutura aberta, do pedido do plano ao fim do apply. */
function openCreation(activity: SiteActivity): OpenInfraRun | null {
  const run = activity.openInfra;
  return run !== null && run.kind === 'criar' ? run : null;
}

/** A criação da infraestrutura aplicando: o andamento que a aba acompanha (#826). */
function applyingCreation(activity: SiteActivity): OpenInfraRun | null {
  const run = openCreation(activity);
  return run?.status === 'aplicando' ? run : null;
}

const snapshotOf = (activity: SiteActivity, current: Snapshot | null): Snapshot => ({
  activity,
  watched: activity.open?.id ?? current?.watched ?? null,
  watchedInfra: openCreation(activity)?.id ?? current?.watchedInfra ?? null,
});

const isPolling = (activity: SiteActivity) =>
  activity.open !== null || applyingCreation(activity) !== null;

/**
 * Atividade da aba: a da página até o polling trazer outra; quando a página entrega uma nova
 * (depois do `revalidatePath` de uma ação), ela substitui a do polling, como em `ReleasesTable`.
 * `watched` e `watchedInfra` são a última execução de build e a última criação da infra vistas
 * abertas, para mostrar o resultado delas quando fecharem. O polling só roda com build aberto
 * ou criação aplicando (o plano tem o polling do diálogo). Quando a criação acompanhada fecha, a página é relida (`router.refresh`), para a etapa
 * Infra e zona seguir o ciclo de vida que o apply avançou, como em `useInfraCheck`.
 */
function useSiteActivity(
  activity: SiteActivity,
  status: SiteActivityStatus,
  pollMs: number,
): Snapshot {
  const router = useRouter();
  const [source, setSource] = useState(activity);
  const [snapshot, setSnapshot] = useState<Snapshot>(() => snapshotOf(activity, null));
  if (source !== activity) {
    setSource(activity);
    setSnapshot((current) => snapshotOf(activity, current));
  }
  const poll = useCallback(async () => {
    const next = await status();
    if (next !== null) setSnapshot((current) => snapshotOf(next, current));
  }, [status]);
  usePolling(isPolling(snapshot.activity), poll, pollMs);
  const closedInfra = finishedInfra(snapshot)?.id ?? null;
  useEffect(() => {
    if (closedInfra !== null) router.refresh();
  }, [closedInfra, router]);
  return snapshot;
}

function finishedInfra({ activity, watchedInfra }: Snapshot): InfraHistoryItem | undefined {
  if (watchedInfra === null || openCreation(activity) !== null) return undefined;
  return activity.history.find(
    (item): item is InfraHistoryItem => item.type === 'infra' && item.id === watchedInfra,
  );
}

type Banner = { key: string; type: TypeAttributes.Status; text: string };

/** Faixa do build: a execução aberta ou, quando ela termina, o resultado. */
function buildBanner({ activity, watched }: Snapshot, timeZone: string): Banner | null {
  if (activity.open !== null) {
    return { key: 'build', type: 'info', text: liveStatusText(activity.open, timeZone) };
  }
  const finished = activity.history.find(
    (item): item is ExecutionHistoryItem => item.type === 'execucao' && item.id === watched,
  );
  return finished
    ? {
        key: 'build',
        type: RESULT_TYPE[finished.status],
        text: liveResultText(finished, timeZone),
      }
    : null;
}

/** Faixa da criação da infra (#826): a etapa aplicando ou, quando termina, o resultado. */
function infraBanner(snapshot: Snapshot, timeZone: string): Banner | null {
  const applying = applyingCreation(snapshot.activity);
  if (applying !== null) return { key: 'infra', type: 'info', text: infraLiveStatusText(applying) };
  const finished = finishedInfra(snapshot);
  return finished
    ? {
        key: 'infra',
        type: finished.status === 'ok' ? 'success' : 'danger',
        text: infraLiveResultText(finished, timeZone),
      }
    : null;
}

/**
 * Atividade do site com o status ao vivo (#638): no topo, a faixa com a execução aberta ("na
 * fila" com o horário previsto, "em andamento" com a etapa) e, quando ela termina, o resultado;
 * embaixo, o `SiteBuildsTable` com o histórico relido. A criação da infraestrutura aplicando
 * (#826) entra na mesma faixa, com a etapa corrente e, no fim, concluída ou a etapa e o motivo da
 * falha. Enquanto há execução aberta, relê a
 * atividade pela Server Action a cada `pollMs`; sem execução aberta, não consulta. A faixa fica
 * num contêiner `role="status"` sempre montado, para o leitor de tela anunciar cada mudança.
 * Com `panel` (o painel de etapas da aba "Publicação", #647), desenha-o acima, com a mesma
 * atividade relida, e põe o título "Histórico" entre os dois: um polling só para a aba.
 */
export function SiteLiveActivity({
  activity,
  status,
  timeZone,
  pollMs = SITE_ACTIVITY_POLL_MS,
  panel,
}: {
  activity: SiteActivity;
  status: SiteActivityStatus;
  timeZone: string;
  pollMs?: number;
  panel?: (activity: SiteActivity) => ReactNode;
}) {
  const snapshot = useSiteActivity(activity, status, pollMs);
  // Build e criação da infra correm à parte (cadastrar o site já enfileira um build): uma faixa
  // para cada.
  const banners = [buildBanner(snapshot, timeZone), infraBanner(snapshot, timeZone)].filter(
    (banner): banner is Banner => banner !== null,
  );
  return (
    <div className="space-y-4">
      {panel && (
        <>
          {panel(snapshot.activity)}
          <h2 className="h5 pt-2">Histórico</h2>
        </>
      )}
      <div role="status" className="space-y-2">
        {banners.map((banner) => (
          <Alert key={banner.key} type={banner.type} showIcon duration={0}>
            {banner.text}
          </Alert>
        ))}
      </div>
      <SiteBuildsTable history={snapshot.activity.history} timeZone={timeZone} />
    </div>
  );
}
