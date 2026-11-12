'use client';

import { useId, useState } from 'react';

import { Button, type ButtonProps } from '@/components/ui/Button';
import { DateTimepicker } from '@/components/ui/DatePicker';
import Dialog from '@/components/ui/Dialog';
import { FormItem } from '@/components/ui/Form';

// Botão que abre o Dialog de agendamento (#492), compartilhado pela página do conteúdo
// ("Agendar") e pelo painel de revisão ("Aprovar e agendar", workspace#89): o DateTimepicker do
// Ecme na hora de parede de São Paulo, o dia que conta no limite diário
// (`PUBLISH_DAY_TIME_ZONE`); confirmar fecha o Dialog e entrega o instante escolhido.

/** O fuso do agendamento: o do dia do limite diário, não o do site. */
export const SCHEDULE_TIME_ZONE = 'America/Sao_Paulo';

export function ScheduleDialog({
  label = 'Agendar',
  size = 'sm',
  disabled = false,
  describedBy,
  onSchedule,
}: {
  /** Rótulo do botão que abre o Dialog (inclusive o do envio em curso). */
  label?: string;
  size?: ButtonProps['size'];
  /** Ação indisponível (envio em curso ou bloqueio); o motivo vai em `describedBy`. */
  disabled?: boolean;
  describedBy?: string;
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
        size={size}
        aria-haspopup="dialog"
        aria-describedby={describedBy}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <Dialog isOpen={open} onClose={close} aria={{ labelledby: `${id}-title` }}>
        <h4 id={`${id}-title`}>Agendar publicação</h4>
        <form
          className="mt-6"
          onSubmit={(event) => {
            // O Dialog pode estar dentro de outro formulário (o do checklist da revisão).
            event.preventDefault();
            event.stopPropagation();
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
