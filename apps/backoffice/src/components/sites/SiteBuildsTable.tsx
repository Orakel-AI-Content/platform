'use client';

import { useState } from 'react';
import { PiCaretRight } from 'react-icons/pi';

import { EmptyState } from '@/components/shared/EmptyState';
import { IconButton } from '@/components/shared/IconButton';
import {
  BUILD_STATUS_LABEL,
  BUILD_STATUS_VARIANT,
  formatDateTime,
  historyItemTitle,
} from '@/components/shared/siteLabels.ts';
import { Timeline } from '@/components/ui/Timeline';
import classNames from '@/components/ui/utils/classNames';
import type { SiteHistoryItem } from '@/domain/builds/builds.ts';

import { type FailedExecution, SiteExecutionDrawer } from './SiteExecutionDrawer.tsx';
import { StateTag } from './SiteStatus.tsx';

/** Resultado de uma criação da infra (#826): o motivo da falha ou os nameservers da zona. */
function infraResult(item: SiteHistoryItem): string | null {
  if (item.type !== 'infra') return null;
  if (item.failure?.message) return `Motivo: ${item.failure.message}`;
  if (item.nameservers && item.nameservers.length > 0) {
    return `Nameservers: ${item.nameservers.join(', ')}`;
  }
  return null;
}

function isFailed(item: SiteHistoryItem): item is FailedExecution {
  return item.type === 'execucao' && item.failure !== null;
}

/** Quem: no cancelado pedido por alguém, quem cancelou; senão, quem pediu. */
function actor(item: SiteHistoryItem): string {
  if (item.type === 'evento' || item.type === 'infra') return item.requestedBy;
  if (item.status === 'cancelado' && item.cancelRequestedBy !== null) {
    return item.cancelRequestedBy;
  }
  return item.requestedBy ?? '—';
}

/** Versão: a do site da execução; na troca de versão, a release anterior e a nova. */
function version(item: SiteHistoryItem): string | null {
  if (item.type === 'execucao') return item.versionId;
  if (item.type === 'infra') return null;
  if (item.kind === 'troca_de_versao' && item.release !== null) {
    return item.previousRelease ? `${item.previousRelease} → ${item.release}` : item.release;
  }
  return null;
}

/**
 * Histórico da aba "Publicação" da página do site (#651; era a `Table` do #637): publicações,
 * reversões, cancelamentos, trocas de versão, pausas e retomadas no `Timeline` do Ecme, um item
 * por acontecimento, na ordem em que `siteActivity` entrega (da mais recente para a mais
 * antiga), sem busca nem paginação. Cada item tem o título (tipo e, na execução, o resultado que
 * o status não diz: cancelada, a etapa da falha; na pausa, o motivo), o status na `StateTag` (só
 * nas execuções), quem (no cancelamento, quem cancelou), quando no fuso do site e a versão. O
 * marcador é decorativo, na cor do status. O item de uma falha tem o botão "Ver detalhe", que
 * abre o `SiteExecutionDrawer`; o item em si não é clicável, e o foco volta ao botão quando o
 * painel fecha. A criação da infraestrutura (#826) diz, abaixo, o motivo da falha (a etapa vai
 * no título) ou os nameservers a configurar no registrador. Sem itens, o `EmptyState`. O título
 * "Histórico" fica acima, no
 * `SiteLiveActivity`.
 */
export function SiteBuildsTable({
  history,
  timeZone,
}: {
  history: readonly SiteHistoryItem[];
  timeZone: string;
}) {
  const [selected, setSelected] = useState<FailedExecution | null>(null);

  if (history.length === 0) return <EmptyState>Nenhuma atividade ainda.</EmptyState>;

  return (
    <>
      <Timeline>
        {history.map((item) => {
          const failed = isFailed(item) ? item : null;
          const at = formatDateTime(item.at, timeZone);
          const itemVersion = version(item);
          const result = infraResult(item);
          return (
            <Timeline.Item
              key={`${item.type}-${item.id}`}
              media={
                <span
                  className={classNames(
                    'block h-3 w-3 rounded-full',
                    item.type === 'execucao' ? BUILD_STATUS_VARIANT[item.status] : 'bg-gray-400',
                  )}
                />
              }
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="heading-text font-semibold wrap-anywhere">
                      {historyItemTitle(item)}
                    </span>
                    {item.type === 'execucao' && (
                      <StateTag color={BUILD_STATUS_VARIANT[item.status]}>
                        {BUILD_STATUS_LABEL[item.status]}
                      </StateTag>
                    )}
                  </div>
                  <p className="wrap-anywhere">
                    {actor(item)}
                    {' · '}
                    <time dateTime={item.at.toISOString()}>{at}</time>
                    {itemVersion !== null && ` · Versão ${itemVersion}`}
                  </p>
                  {result !== null && <p className="wrap-anywhere">{result}</p>}
                </div>
                {failed && (
                  <IconButton
                    label={`Ver detalhe da falha de ${at}`}
                    icon={<PiCaretRight />}
                    onClick={() => setSelected(failed)}
                  />
                )}
              </div>
            </Timeline.Item>
          );
        })}
      </Timeline>
      <SiteExecutionDrawer
        execution={selected}
        timeZone={timeZone}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
