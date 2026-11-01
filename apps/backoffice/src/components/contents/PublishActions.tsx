'use client';

import { createContext, use, useId, useState, type ReactNode } from 'react';

import type { ActionResult } from '@/components/shared/actionResult.ts';
import { ActionAlert, useActionResult } from '@/components/shared/ActionFeedback.tsx';
import { formatDateTime } from '@/components/shared/siteLabels.ts';
import { Button } from '@/components/ui/Button';
import { DateTimepicker } from '@/components/ui/DatePicker';
import Dialog from '@/components/ui/Dialog';
import { FormItem } from '@/components/ui/Form';

// Publicar, agendar e cancelar o agendamento na página do conteúdo (#492), no retorno padrão das
// ações: a Server Action delega ao domínio, o sucesso vai para o toast e a recusa (inclusive o
// limite diário) para o Alert do escopo, abaixo da linha do título, como o `SubmitForReviewScope`.
// A página monta as ações para quem tem content.publish; elas dependem do status da versão mais
// recente: "Publicar" e "Agendar" com `aprovado`, o horário marcado e "Cancelar agendamento" com
// `agendado`. "Agendar" abre o Dialog com o DateTimepicker do Ecme na hora de parede de São
// Paulo, o dia que conta no limite diário (`PUBLISH_DAY_TIME_ZONE`), e envia o instante em ISO.

/** O fuso do agendamento: o do dia do limite diário, não o do site. */
export const SCHEDULE_TIME_ZONE = 'America/Sao_Paulo';

const PublishActionsContext = createContext<ReturnType<typeof useActionResult> | null>(null);

/** Guarda o estado das ações e mostra a recusa no Alert, sempre montado, abaixo de `children`. */
export function PublishActionsScope({ children }: { children: ReactNode }) {
  const state = useActionResult();
  return (
    <PublishActionsContext value={state}>
      {children}
      <ActionAlert error={state.error} />
    </PublishActionsContext>
  );
}

type PublishActionsProps = {
  /** Status da versão mais recente; fora de `aprovado` e `agendado`, nada aparece. */
  status: string;
  /** Horário marcado da versão `agendado` (`scheduledPublicationAt`). */
  scheduledAt: Date | null;
  publish: () => Promise<ActionResult>;
  schedule: (at: string) => Promise<ActionResult>;
  cancel: () => Promise<ActionResult>;
};

/** As ações, dentro de um `PublishActionsScope`. */
export function PublishActions({
  status,
  scheduledAt,
  publish,
  schedule,
  cancel,
}: PublishActionsProps) {
  const scope = use(PublishActionsContext);
  if (scope === null) throw new Error('PublishActions fora de um PublishActionsScope.');

  if (status === 'agendado') {
    return (
      <>
        {scheduledAt !== null && (
          <span className="text-sm tabular-nums">
            Agendado para {formatDateTime(scheduledAt, SCHEDULE_TIME_ZONE)}
          </span>
        )}
        <Button type="button" size="sm" disabled={scope.pending} onClick={() => scope.run(cancel)}>
          {scope.pending ? 'Cancelando agendamento…' : 'Cancelar agendamento'}
        </Button>
      </>
    );
  }
  if (status !== 'aprovado') return null;
  return (
    <>
      <ScheduleDialog
        pending={scope.pending}
        onSchedule={(at) => scope.run(() => schedule(at.toISOString()))}
      />
      <Button
        type="button"
        variant="solid"
        size="sm"
        disabled={scope.pending}
        onClick={() => scope.run(publish)}
      >
        {scope.pending ? 'Publicando…' : 'Publicar'}
      </Button>
    </>
  );
}

/** "Agendar" e o Dialog com a data e a hora; confirmar fecha o Dialog e roda a ação. */
function ScheduleDialog({
  pending,
  onSchedule,
}: {
  pending: boolean;
  onSchedule: (at: Date) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<Date | null>(null);
  const close = () => setOpen(false);

  return (
    <>
      <Button
        type="button"
        size="sm"
        aria-haspopup="dialog"
        disabled={pending}
        onClick={() => setOpen(true)}
      >
        Agendar
      </Button>
      <Dialog isOpen={open} onClose={close} aria={{ labelledby: `${id}-title` }}>
        <h4 id={`${id}-title`}>Agendar publicação</h4>
        <form
          className="mt-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (at === null) return;
            close();
            onSchedule(at);
          }}
        >
          <FormItem label="Data e hora (horário de Brasília)">
            <DateTimepicker
              value={at}
              timeZone={SCHEDULE_TIME_ZONE}
              minDate={new Date()}
              onChange={setAt}
            />
          </FormItem>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" onClick={close}>
              Cancelar
            </Button>
            <Button type="submit" variant="solid" size="sm" disabled={at === null}>
              Agendar
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
