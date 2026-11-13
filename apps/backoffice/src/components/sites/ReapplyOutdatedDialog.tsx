'use client';

import { useCallback, useRef, useState, useTransition } from 'react';
import { TbRefresh } from 'react-icons/tb';

import { ActionAlert, pushSuccess } from '@/components/shared/ActionFeedback.tsx';
import type { ActionResult } from '@/components/shared/actionResult.ts';
import ConfirmDialog from '@/components/shared/ConfirmDialog.tsx';
import { infraRunStepLabel, REAPPLY_OUTDATED_LABEL } from '@/components/shared/siteLabels.ts';
import { usePolling } from '@/components/shared/usePolling.ts';
import { Button } from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import type { InfraPlanSummary } from '@/domain/infra/drivers.ts';

import {
  INFRA_PLAN_POLL_MS,
  INFRA_REQUEST_FAILED,
  INFRA_SUMMARY_UNREADABLE,
  InfraPlanSteps,
} from './CreateInfraDialog.tsx';
import { awaitsConfirmation, type InfraBatchView } from './infraBatchView.ts';

// "Reaplicar nos desatualizados" da lista de sites (workspace#98): pede o lote, espera o plano de
// cada site e mostra o resumo de todos, com uma confirmação única. Um lote ainda à espera da
// confirmação (fechado o diálogo antes de confirmar) é retomado, nunca pedido de novo: o domínio
// recusaria, e o lote não tem como ser cancelado. A recusa de "Confirmar" fica no Alert do
// diálogo e o sucesso vai ao toast, como no `RolloutButton`.

export const REAPPLY_OUTDATED_TITLE = 'Reaplicar a infraestrutura dos sites desatualizados?';

export const INFRA_BATCH_ALREADY_CONFIRMED =
  'Esta reaplicação já foi confirmada; o andamento aparece no cartão da lista.';

/** Mensagem da falha do plano sem motivo gravado. */
const PLAN_FAILED = 'Não foi possível preparar o resumo.';

export type OutdatedBatchState =
  | { kind: 'preparando' }
  | { kind: 'resumo'; sites: { siteId: string; summary: InfraPlanSummary }[] }
  | { kind: 'erro'; message: string };

export type ReapplyOutdatedActions = {
  request: () => Promise<{ ok: true; batchId: number } | { ok: false; message: string }>;
  /** O lote mais recente; `null` sem lote ou na falha da leitura. */
  read: () => Promise<InfraBatchView | null>;
  confirm: (batchId: number) => Promise<ActionResult>;
};

/**
 * O estado do diálogo a partir do lote lido: preparando até todos os planos chegarem; o resumo de
 * cada site; o site cujo plano falhou (o lote fecha `interrompido`); ou "já confirmado".
 */
export function outdatedBatchState(batch: InfraBatchView): OutdatedBatchState {
  switch (batch.state) {
    case 'planejando':
      return { kind: 'preparando' };
    case 'aguardando_confirmacao': {
      const sites = batch.sites.flatMap(({ siteId, summary }) =>
        summary === null ? [] : [{ siteId, summary }],
      );
      return sites.length === batch.sites.length
        ? { kind: 'resumo', sites }
        : { kind: 'erro', message: INFRA_SUMMARY_UNREADABLE };
    }
    case 'interrompido': {
      const failed = batch.sites.find((site) => site.failure !== null);
      if (failed === undefined) return { kind: 'erro', message: PLAN_FAILED };
      const step = failed.failure?.step;
      const where = step ? ` (${infraRunStepLabel(step)})` : '';
      return {
        kind: 'erro',
        message: `${failed.siteId}${where}: ${failed.failure?.message ?? PLAN_FAILED}`,
      };
    }
    default:
      return { kind: 'erro', message: INFRA_BATCH_ALREADY_CONFIRMED };
  }
}

/**
 * Controle do diálogo: `start` retoma o lote à espera da confirmação ou pede um novo, e lê o lote
 * a cada `pollMs` enquanto os planos são preparados. `batchId` é o lote que "Confirmar" confirma.
 */
export function useReapplyOutdated({
  request,
  read,
  pollMs = INFRA_PLAN_POLL_MS,
}: Pick<ReapplyOutdatedActions, 'request' | 'read'> & { pollMs?: number }) {
  const [isOpen, setOpen] = useState(false);
  const [batchId, setBatchId] = useState<number | null>(null);
  const [state, setState] = useState<OutdatedBatchState>({ kind: 'preparando' });

  const load = useCallback(
    async (id: number) => {
      const batch = await read();
      if (batch?.id === id) setState(outdatedBatchState(batch));
    },
    [read],
  );
  const poll = useCallback(
    () => (batchId === null ? Promise.resolve() : load(batchId)),
    [batchId, load],
  );
  usePolling(isOpen && batchId !== null && state.kind === 'preparando', poll, pollMs);

  const begin = async () => {
    const latest = await read();
    if (latest !== null && awaitsConfirmation(latest)) {
      setBatchId(latest.id);
      setState(outdatedBatchState(latest));
      return;
    }
    const requested = await request();
    if (!requested.ok) {
      setState({ kind: 'erro', message: requested.message });
      return;
    }
    setBatchId(requested.batchId);
    await load(requested.batchId);
  };

  const start = () => {
    setOpen(true);
    setBatchId(null);
    setState({ kind: 'preparando' });
    begin().catch(() => setState({ kind: 'erro', message: INFRA_REQUEST_FAILED }));
  };

  const close = () => setOpen(false);

  return { isOpen, state, batchId, start, close };
}

export function ReapplyOutdatedDialog({
  isOpen,
  state,
  pending = false,
  error = null,
  names = {},
  onCancel,
  onConfirm,
  onAfterClose,
}: {
  isOpen: boolean;
  state: OutdatedBatchState;
  /** "Confirmar" enviado, à espera da resposta. */
  pending?: boolean;
  /** Recusa de "Confirmar". */
  error?: string | null;
  /** Nome de cada site pelo id; sem ele, o id. */
  names?: Readonly<Record<string, string>>;
  onCancel: () => void;
  /** Só chamado com o resumo na tela. */
  onConfirm: () => void;
  onAfterClose?: () => void;
}) {
  return (
    <ConfirmDialog
      isOpen={isOpen}
      type="info"
      title={REAPPLY_OUTDATED_TITLE}
      confirmText={pending ? 'Confirmando…' : 'Confirmar'}
      confirmButtonProps={{ disabled: state.kind !== 'resumo', loading: pending }}
      cancelButtonProps={{ disabled: pending }}
      onCancel={() => {
        if (!pending) onCancel();
      }}
      onConfirm={() => {
        if (state.kind === 'resumo' && !pending) onConfirm();
      }}
      onAfterClose={onAfterClose}
    >
      <div role="status">
        {state.kind === 'preparando' && (
          <p className="flex items-center gap-2">
            <Spinner size={20} />
            Preparando o resumo de cada site desatualizado…
          </p>
        )}
      </div>
      {state.kind === 'resumo' && (
        <>
          <p className="mb-3">
            A infraestrutura de cada site volta à descrição atual, um site por vez; se um falhar, os
            seguintes ficam como estão. Nada é aplicado antes de &quot;Confirmar&quot;.
          </p>
          <ul aria-label="Sites a reaplicar" className="flex flex-col gap-4">
            {state.sites.map(({ siteId, summary }) => (
              <li key={siteId} aria-label={names[siteId] ?? siteId} className="flex flex-col gap-1">
                <span className="font-bold text-gray-900 wrap-anywhere dark:text-gray-100">
                  {names[siteId] ?? siteId}
                </span>
                <InfraPlanSteps summary={summary} />
              </li>
            ))}
          </ul>
        </>
      )}
      <ActionAlert error={state.kind === 'erro' ? state.message : error} className="mt-4" />
    </ConfirmDialog>
  );
}

/**
 * "Reaplicar nos desatualizados" no cabeçalho da lista: o botão e o diálogo. A página só o põe com
 * `site.configure`, com algum site desatualizado e sem lote aplicando.
 */
export function ReapplyOutdatedButton({
  actions,
  names,
  pollMs,
}: {
  actions: ReapplyOutdatedActions;
  names?: Readonly<Record<string, string>>;
  pollMs?: number;
}) {
  const dialog = useReapplyOutdated({ request: actions.request, read: actions.read, pollMs });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const trigger = useRef<HTMLButtonElement>(null);

  const confirm = () => {
    const { batchId } = dialog;
    if (batchId === null) return;
    setError(null);
    startTransition(async () => {
      const result = await actions.confirm(batchId);
      if (result.ok) {
        dialog.close();
        pushSuccess(result.message);
      } else {
        setError(result.message);
      }
    });
  };

  return (
    <>
      <Button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        icon={<TbRefresh className="text-xl" aria-hidden />}
        onClick={() => {
          setError(null);
          dialog.start();
        }}
      >
        {REAPPLY_OUTDATED_LABEL}
      </Button>
      <ReapplyOutdatedDialog
        isOpen={dialog.isOpen}
        state={dialog.state}
        pending={pending}
        error={error}
        names={names}
        onCancel={dialog.close}
        onConfirm={confirm}
        onAfterClose={() => trigger.current?.focus()}
      />
    </>
  );
}
