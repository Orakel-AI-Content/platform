'use client';

import { type MouseEvent, useState } from 'react';
import { PiCaretRight } from 'react-icons/pi';

import { EmptyState } from '@/components/shared/EmptyState';
import { IconButton } from '@/components/shared/IconButton';
import {
  BUILD_STATUS_LABEL,
  BUILD_STATUS_VARIANT,
  HISTORY_KIND_LABEL,
  formatDateTime,
} from '@/components/shared/siteLabels.ts';
import Table from '@/components/ui/Table';
import type { SiteHistoryItem } from '@/domain/builds/builds.ts';

import { type FailedExecution, SiteExecutionDrawer } from './SiteExecutionDrawer.tsx';
import { StateTag } from './SiteStatus.tsx';

const { THead, TBody, Tr, Th, Td } = Table;

function isFailed(item: SiteHistoryItem): item is FailedExecution {
  return item.type === 'execucao' && item.failure !== null;
}

/** Quem: no cancelado pedido por alguém, quem cancelou; senão, quem pediu. */
function actor(item: SiteHistoryItem): string {
  if (item.type === 'evento') return item.requestedBy;
  if (item.status === 'cancelado' && item.cancelRequestedBy !== null) {
    return item.cancelRequestedBy;
  }
  return item.requestedBy ?? '—';
}

/** Versão: a do site da execução; na troca de versão, a release anterior e a nova. */
function version(item: SiteHistoryItem): string {
  if (item.type === 'execucao') return item.versionId ?? '—';
  if (item.kind === 'troca_de_versao' && item.release !== null) {
    return item.previousRelease ? `${item.previousRelease} → ${item.release}` : item.release;
  }
  return '—';
}

/**
 * Aba "Histórico" da página do site (#637; era a "Builds" do #595): publicações, reversões,
 * trocas de versão, pausas e retomadas, na ordem em que `siteActivity` entrega (da mais recente
 * para a mais antiga), na `Table` do Ecme direto, sem busca, ordem nem paginação. Tipo, Status
 * (só nas execuções, na `StateTag`), Quem, Quando (no fuso do site) e Versão. A linha de uma
 * falha tem o botão "Ver detalhe", que abre o `SiteExecutionDrawer`; o clique na linha faz o
 * mesmo e põe o foco no botão antes, para o foco voltar à linha quando o painel fecha. Sem
 * itens, o `EmptyState`. A tabela rola na horizontal dentro do próprio contêiner, se faltar
 * espaço.
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

  const openFromRow = (item: FailedExecution) => (event: MouseEvent<HTMLTableRowElement>) => {
    event.currentTarget.querySelector<HTMLButtonElement>('button')?.focus();
    setSelected(item);
  };

  return (
    <>
      <Table aria-label="Histórico do site">
        <THead>
          <Tr>
            <Th>Tipo</Th>
            <Th>Status</Th>
            <Th>Quem</Th>
            <Th>Quando</Th>
            <Th>Versão</Th>
            <Th>
              <span className="sr-only">Detalhe</span>
            </Th>
          </Tr>
        </THead>
        <TBody>
          {history.map((item) => {
            const failed = isFailed(item) ? item : null;
            const at = formatDateTime(item.at, timeZone);
            return (
              <Tr
                key={`${item.type}-${item.id}`}
                className={failed ? 'cursor-pointer' : undefined}
                onClick={failed ? openFromRow(failed) : undefined}
              >
                <Td className="whitespace-nowrap">{HISTORY_KIND_LABEL[item.kind]}</Td>
                <Td>
                  {item.type === 'execucao' ? (
                    <StateTag color={BUILD_STATUS_VARIANT[item.status]}>
                      {BUILD_STATUS_LABEL[item.status]}
                    </StateTag>
                  ) : (
                    '—'
                  )}
                </Td>
                <Td className="wrap-anywhere">{actor(item)}</Td>
                <Td className="whitespace-nowrap">{at}</Td>
                <Td className="wrap-anywhere">{version(item)}</Td>
                <Td>
                  {failed && (
                    <IconButton
                      label={`Ver detalhe da falha de ${at}`}
                      icon={<PiCaretRight />}
                      onClick={(event) => {
                        // O clique da linha já abre; aqui só evita abrir duas vezes.
                        event.stopPropagation();
                        setSelected(failed);
                      }}
                    />
                  )}
                </Td>
              </Tr>
            );
          })}
        </TBody>
      </Table>
      <SiteExecutionDrawer
        execution={selected}
        timeZone={timeZone}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
