'use client';

import { useCallback, useState } from 'react';

import {
  INFRA_BATCH_SITE_COLOR,
  INFRA_BATCH_SITE_LABEL,
  INFRA_BATCH_STATE_LABEL,
  infraRunStepLabel,
} from '@/components/shared/siteLabels.ts';
import { usePolling } from '@/components/shared/usePolling.ts';
import { StateTag } from '@/components/sites/SiteStatus';
import Card from '@/components/ui/Card';

import { isOpenBatch, type InfraBatchSiteView, type InfraBatchView } from './infraBatchView.ts';

// Cartão do lote "Reaplicar nos desatualizados" na lista de sites (workspace#98), no molde do
// `RolloutCard`: o estado e "N de M" no título, cada site na ordem com o estado e, no que falhou,
// a etapa e o motivo. O resumo fica num `role="status"`, para o leitor de tela anunciar o avanço
// que o polling traz.

/** Intervalo da leitura do lote enquanto ele está aberto. */
export const INFRA_BATCH_POLL_MS = 5000;

/** Sem motivo gravado na falha. */
const NO_REASON = 'sem motivo registrado';

function siteStateText(site: InfraBatchSiteView): string {
  const label = INFRA_BATCH_SITE_LABEL[site.status];
  return site.status === 'aplicando' && site.currentStep !== null
    ? `${label} · ${infraRunStepLabel(site.currentStep)}`
    : label;
}

/** A falha de um site: "Falhou em Regras: motivo", ou sem a etapa quando ela não foi gravada. */
export function batchFailureText(failure: NonNullable<InfraBatchSiteView['failure']>): string {
  const where = failure.step === null ? 'Falhou' : `Falhou em ${infraRunStepLabel(failure.step)}`;
  return `${where}: ${failure.message ?? NO_REASON}`;
}

export function InfraBatchCard({
  batch,
  names = {},
}: {
  batch: InfraBatchView;
  /** Nome de cada site pelo id; sem ele, o id. */
  names?: Readonly<Record<string, string>>;
}) {
  const done = batch.sites.filter((site) => site.status === 'ok').length;
  const skipped = batch.sites.some((site) => site.status === 'cancelado');
  return (
    <Card bodyClass="space-y-3">
      <div role="status" aria-label="Progresso da reaplicação">
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
          Reaplicação nos desatualizados · {INFRA_BATCH_STATE_LABEL[batch.state]} ·{' '}
          <span className="tabular-nums">
            {done} de {batch.sites.length}
          </span>
        </h2>
        <p className="text-sm">Pedida por {batch.requestedBy}</p>
      </div>
      <ul aria-label="Sites da reaplicação" className="space-y-2 text-sm">
        {batch.sites.map((site) => (
          <li key={site.siteId} className="flex flex-col gap-1">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-gray-900 wrap-anywhere dark:text-gray-100">
                {names[site.siteId] ?? site.siteId}
              </span>
              <StateTag color={INFRA_BATCH_SITE_COLOR[site.status]}>{siteStateText(site)}</StateTag>
            </span>
            {site.failure !== null && (
              <span className="wrap-anywhere">{batchFailureText(site.failure)}</span>
            )}
          </li>
        ))}
      </ul>
      {skipped && (
        <p className="text-sm">Os sites não aplicados continuam como estavam, desatualizados.</p>
      )}
    </Card>
  );
}

/**
 * O cartão com o lote lido pela página e relido a cada `pollMs` enquanto está aberto. Quando o
 * lote fecha, `refresh` relê a lista (selos e botão do cabeçalho vêm do servidor). A página o
 * monta com a chave do lote e do estado, para recomeçar do que ela leu.
 */
export function InfraBatchProgress({
  initial,
  read,
  refresh,
  names,
  pollMs = INFRA_BATCH_POLL_MS,
}: {
  initial: InfraBatchView;
  read: () => Promise<InfraBatchView | null>;
  refresh: () => Promise<void>;
  names?: Readonly<Record<string, string>>;
  pollMs?: number;
}) {
  const [batch, setBatch] = useState(initial);
  const poll = useCallback(async () => {
    const latest = await read();
    if (latest?.id !== initial.id) return;
    setBatch(latest);
    if (!isOpenBatch(latest)) await refresh();
  }, [read, refresh, initial.id]);
  usePolling(isOpenBatch(batch), poll, pollMs);
  return <InfraBatchCard batch={batch} names={names} />;
}
