'use client';

import type { ActionResult } from '@/components/shared/actionResult.ts';
import { formatDateTime } from '@/components/shared/siteLabels.ts';
import { Button } from '@/components/ui/Button';

import { useContentAction } from './ContentActionScope.tsx';
import { SCHEDULE_TIME_ZONE, ScheduleDialog } from './ScheduleDialog.tsx';

// Publicar, agendar e cancelar o agendamento na página do conteúdo (#492), no retorno padrão das
// ações: a Server Action delega ao domínio, o sucesso vai para o toast e a recusa (inclusive o
// limite diário) para o Alert do `ContentActionScope`, abaixo da linha do título, como "Enviar
// para revisão". A página monta as ações para quem tem content.publish; elas dependem do status
// da versão mais recente: "Publicar" e "Agendar" com `aprovado`, o horário marcado e "Cancelar agendamento" com
// `agendado`. "Agendar" abre o Dialog com o DateTimepicker do Ecme na hora de parede de São
// Paulo, o dia que conta no limite diário (`PUBLISH_DAY_TIME_ZONE`), e envia o instante em ISO.

type PublishActionsProps = {
  /** Status da versão mais recente; fora de `aprovado` e `agendado`, nada aparece. */
  status: string;
  /** Horário marcado da versão `agendado` (`scheduledPublicationAt`). */
  scheduledAt: Date | null;
  publish: () => Promise<ActionResult>;
  schedule: (at: string) => Promise<ActionResult>;
  cancel: () => Promise<ActionResult>;
};

/** As ações, dentro de um `ContentActionScope`. */
export function PublishActions({
  status,
  scheduledAt,
  publish,
  schedule,
  cancel,
}: PublishActionsProps) {
  const scope = useContentAction('PublishActions');

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
        size="sm"
        disabled={scope.pending}
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
