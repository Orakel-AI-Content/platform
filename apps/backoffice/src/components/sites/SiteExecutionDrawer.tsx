'use client';

import { InfoField, InfoList } from '@/components/shared/InfoList';
import {
  BUILD_STAGE_LABEL,
  HISTORY_KIND_LABEL,
  formatDateTime,
} from '@/components/shared/siteLabels.ts';
import { Drawer } from '@/components/ui/Drawer';
import type { ExecutionHistoryItem } from '@/domain/builds/builds.ts';

/** Execução do histórico que tem detalhe de falha (a que o painel abre). */
export type FailedExecution = ExecutionHistoryItem & {
  failure: NonNullable<ExecutionHistoryItem['failure']>;
};

/**
 * Detalhe de uma execução que falhou, no histórico da aba "Publicação" da página do site (#637, #647): o `Drawer`
 * do Ecme à direita, com quando terminou, quem pediu, a etapa em que parou ("—" no rollback,
 * que é um container só), a mensagem e o fim do log do container (só o trecho final, como o
 * build-runner grava). O log fica num `<pre>` rolável e focável, para o teclado chegar nele.
 * Fechado com `execution` nulo; o foco volta ao botão que abriu pelo `react-modal`.
 */
export function SiteExecutionDrawer({
  execution,
  timeZone,
  onClose,
}: {
  execution: FailedExecution | null;
  timeZone: string;
  onClose: () => void;
}) {
  const failure = execution?.failure;
  return (
    <Drawer
      isOpen={execution !== null}
      title={execution ? `Falha da ${HISTORY_KIND_LABEL[execution.kind].toLowerCase()}` : ''}
      onClose={onClose}
      width={480}
    >
      {execution && failure && (
        <InfoList>
          <InfoField label="Quando">{formatDateTime(execution.at, timeZone)}</InfoField>
          <InfoField label="Quem pediu">{execution.requestedBy ?? '—'}</InfoField>
          <InfoField label="Etapa">
            {failure.stage ? BUILD_STAGE_LABEL[failure.stage] : '—'}
          </InfoField>
          <InfoField label="Mensagem">{failure.message ?? '—'}</InfoField>
          <InfoField label="Fim do log" className="font-normal">
            {failure.logTail ? (
              <pre
                tabIndex={0}
                aria-label="Fim do log"
                className="mt-1 max-h-96 overflow-auto rounded-lg bg-gray-100 p-3 text-xs whitespace-pre-wrap wrap-anywhere dark:bg-gray-700"
              >
                {failure.logTail}
              </pre>
            ) : (
              'Sem log gravado.'
            )}
          </InfoField>
        </InfoList>
      )}
    </Drawer>
  );
}
