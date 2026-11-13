'use client';

import { ActionAlert } from '@/components/shared/ActionFeedback.tsx';
import ConfirmDialog from '@/components/shared/ConfirmDialog.tsx';
import Spinner from '@/components/ui/Spinner';

import { InfraPlanSteps, type CreateInfraState } from './CreateInfraDialog.tsx';

// "Reaplicar infraestrutura" da etapa Infra e zona (workspace#98), sobre o mesmo motor do
// `CreateInfraDialog` (`useCreateInfra`, `infraPlanState`): preparando um plano novo, o resumo do
// que muda por etapa e o erro ao preparar. "Confirmar" só fica ativo com o resumo; "Cancelar" só
// fecha, e a execução continua aberta para "Revisar e confirmar a reaplicação".

export const REAPPLY_TITLE = 'Reaplicar a infraestrutura do site?';

export const INFRA_REAPPLY_ALREADY_CONFIRMED =
  'Esta reaplicação da infraestrutura já foi confirmada; o andamento aparece no histórico do site.';

export function ReapplyInfraDialog({
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
      title={REAPPLY_TITLE}
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
            Preparando o resumo do que será reaplicado…
          </p>
        )}
      </div>
      {state.kind === 'resumo' && (
        <>
          <p className="mb-3">
            A infraestrutura do site volta à descrição atual. Confira o que muda em cada etapa. Nada
            é aplicado antes de &quot;Confirmar&quot;.
          </p>
          <InfraPlanSteps summary={state.summary} />
        </>
      )}
      <ActionAlert error={state.kind === 'erro' ? state.message : null} />
    </ConfirmDialog>
  );
}
