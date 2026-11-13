import type { InfraBatchState, InfraRunStatus, InfraStep } from '@/db/schema/operations.ts';
import type { InfraPlanSummary } from '@/domain/infra/drivers.ts';

// O lote "Reaplicar nos desatualizados" (workspace#98) como a lista de sites o mostra: o
// `InfraBatch` do domínio com o resumo de cada plano já validado no servidor, para o diálogo e o
// cartão não importarem o Zod do infra-runner.

/** Um site do lote, na ordem. */
export type InfraBatchSiteView = {
  siteId: string;
  status: InfraRunStatus;
  /** Etapa em andamento, enquanto `aplicando`. */
  currentStep: InfraStep | null;
  /** Nulo sem plano gravado ou com um resumo que não é um `InfraPlanSummary` válido. */
  summary: InfraPlanSummary | null;
  /** Só no `falhou`. */
  failure: { step: InfraStep | null; message: string | null } | null;
};

export type InfraBatchView = {
  id: number;
  state: InfraBatchState;
  requestedBy: string;
  startedAt: Date;
  finishedAt: Date | null;
  sites: InfraBatchSiteView[];
};

/** Estados em que o lote ainda espera a confirmação única: o diálogo o retoma. */
export function awaitsConfirmation(batch: InfraBatchView): boolean {
  return batch.state === 'planejando' || batch.state === 'aguardando_confirmacao';
}

/** O lote ainda não fechou (`concluido` ou `interrompido`). */
export function isOpenBatch(batch: InfraBatchView): boolean {
  return batch.state !== 'concluido' && batch.state !== 'interrompido';
}
