'use client';

import { useCallback, useState } from 'react';

import { ActionAlert } from '@/components/shared/ActionFeedback.tsx';
import ConfirmDialog from '@/components/shared/ConfirmDialog.tsx';
import {
  INFRA_RESOURCE_STEP_ORDER,
  INFRA_STEP_LABEL,
  infraStepChangesText,
} from '@/components/shared/siteLabels.ts';
import { usePolling } from '@/components/shared/usePolling.ts';
import Spinner from '@/components/ui/Spinner';
import type { InfraPlanSummary } from '@/domain/infra/drivers.ts';
import type { InfraPlanView } from '@/domain/infra/plan.ts';

// "Criar infraestrutura" da etapa Infra e zona (#825), no molde do `RollbackDialog`: o
// ConfirmDialog do Ecme, sem gatilho próprio, com três estados — preparando o resumo (o plano
// roda no build-runner), o resumo por etapa e o erro ao preparar. "Confirmar" só fica ativo com
// o resumo; "Cancelar" só fecha, e a execução continua aberta para "Revisar e confirmar".

/** O que o diálogo mostra. */
export type CreateInfraState =
  | { kind: 'preparando' }
  | { kind: 'resumo'; summary: InfraPlanSummary }
  | { kind: 'erro'; message: string };

export const INFRA_SUMMARY_UNREADABLE =
  'O resumo do plano não pôde ser lido. Peça ajuda a quem mantém a plataforma.';
export const INFRA_REQUEST_FAILED = 'Não foi possível pedir o plano. Tente de novo.';
export const INFRA_ALREADY_CONFIRMED =
  'Esta criação da infraestrutura já foi confirmada; o andamento aparece na etapa Infra e zona.';

/** O estado do diálogo a partir do plano lido; `null` (leitura falhou) mantém o atual. */
export function infraPlanState(view: InfraPlanView): CreateInfraState {
  switch (view.status) {
    case 'planejando':
      return { kind: 'preparando' };
    case 'aguardando_confirmacao':
      return view.summary === null
        ? { kind: 'erro', message: INFRA_SUMMARY_UNREADABLE }
        : { kind: 'resumo', summary: view.summary };
    case 'falhou':
      return { kind: 'erro', message: view.message };
    default:
      return { kind: 'erro', message: INFRA_ALREADY_CONFIRMED };
  }
}

export const TITLE = 'Criar a infraestrutura do site?';

export function CreateInfraDialog({
  isOpen,
  state,
  onCancel,
  onConfirm,
  onAfterClose,
}: {
  isOpen: boolean;
  state: CreateInfraState;
  onCancel: () => void;
  /** Só chamado com o resumo na tela. */
  onConfirm: () => void;
  /** Depois de fechar: devolve o foco a quem abriu. */
  onAfterClose?: () => void;
}) {
  return (
    <ConfirmDialog
      isOpen={isOpen}
      type="info"
      title={TITLE}
      confirmText="Confirmar"
      confirmButtonProps={{ disabled: state.kind !== 'resumo' }}
      onCancel={onCancel}
      onConfirm={() => {
        if (state.kind === 'resumo') onConfirm();
      }}
      onAfterClose={onAfterClose}
    >
      <div role="status">
        {state.kind === 'preparando' && (
          <p className="flex items-center gap-2">
            <Spinner size={20} />
            Preparando o resumo do que será criado…
          </p>
        )}
      </div>
      {state.kind === 'resumo' && (
        <>
          <p className="mb-3">
            Confira o que muda em cada etapa. Nada é aplicado antes de &quot;Confirmar&quot;.
          </p>
          <ul aria-label="Resumo por etapa" className="flex flex-col gap-1">
            {INFRA_RESOURCE_STEP_ORDER.map((step) => (
              <li key={step} className="flex justify-between gap-4">
                <span className="heading-text font-semibold">{INFRA_STEP_LABEL[step]}</span>
                <span>{infraStepChangesText(state.summary.steps[step])}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <ActionAlert error={state.kind === 'erro' ? state.message : null} />
    </ConfirmDialog>
  );
}

/** Intervalo da leitura do plano enquanto ele é preparado. */
export const INFRA_PLAN_POLL_MS = 3000;

/**
 * Controle do diálogo: `start` pede o plano e abre em "preparando"; `reopen` abre o da execução
 * aberta, lendo o estado salvo. Enquanto prepara, lê o plano a cada `pollMs` (polling próprio:
 * o da aba só segue os builds). `confirm` fecha e devolve a execução a confirmar.
 */
export function useCreateInfra({
  request,
  read,
  pollMs = INFRA_PLAN_POLL_MS,
}: {
  request: () => Promise<{ ok: true; runId: number } | { ok: false; message: string }>;
  read: (runId: number) => Promise<InfraPlanView | null>;
  pollMs?: number;
}) {
  const [isOpen, setOpen] = useState(false);
  const [runId, setRunId] = useState<number | null>(null);
  const [state, setState] = useState<CreateInfraState>({ kind: 'preparando' });

  const load = useCallback(
    async (id: number) => {
      const view = await read(id);
      if (view !== null) setState(infraPlanState(view));
    },
    [read],
  );
  const poll = useCallback(() => (runId === null ? Promise.resolve() : load(runId)), [runId, load]);
  usePolling(isOpen && runId !== null && state.kind === 'preparando', poll, pollMs);

  const start = () => {
    setOpen(true);
    setRunId(null);
    setState({ kind: 'preparando' });
    void request().then(
      (result) => {
        if (!result.ok) {
          setState({ kind: 'erro', message: result.message });
          return;
        }
        setRunId(result.runId);
        return load(result.runId);
      },
      () => setState({ kind: 'erro', message: INFRA_REQUEST_FAILED }),
    );
  };

  const reopen = (id: number) => {
    setOpen(true);
    setRunId(id);
    setState({ kind: 'preparando' });
    void load(id);
  };

  const close = () => setOpen(false);

  return { isOpen, state, runId, start, reopen, close };
}
