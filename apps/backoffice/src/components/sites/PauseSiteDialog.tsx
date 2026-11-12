'use client';

import { useRef, useState } from 'react';

import ConfirmDialog, { dangerConfirmButtonProps } from '@/components/shared/ConfirmDialog.tsx';
import { FormContainer, FormItem } from '@/components/ui/Form';
import Input from '@/components/ui/Input';

import { PauseReasonSchema } from './siteOperationForms.ts';

// "Pausar" o site ativo com motivo (#650, workspace#80): o ConfirmDialog `danger` do Ecme com o
// campo de motivo, obrigatório, no molde do `RebuildReleaseDialog`. Começa vazio a cada
// abertura. Confirmar com o motivo vazio (ou só espaços) não fecha: mostra o erro no
// `FormItem` e devolve o foco ao campo. Sem gatilho próprio: quem abre (o `SiteOperationsScope`)
// guarda o estado, roda a action com o motivo do `onConfirm` e devolve o foco no
// `onAfterClose`. A regra é do domínio (`pauseSiteManually`), que confere o motivo de novo.

export const PAUSE_SITE_LABEL = { idle: 'Pausar', pending: 'Pausando…' };

export function PauseSiteDialog({
  siteId,
  isOpen,
  onCancel,
  onConfirm,
  onAfterClose,
}: {
  siteId: string;
  isOpen: boolean;
  onCancel: () => void;
  /** Confirmado com o motivo, já aparado. */
  onConfirm: (reason: string) => void;
  /** Depois de fechar: devolve o foco a quem abriu. */
  onAfterClose?: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  // A cada abertura, volta ao campo vazio e sem erro (o estado anterior ao render).
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setReason('');
      setError(null);
    }
  }

  const confirm = () => {
    const parsed = PauseReasonSchema.safeParse({ reason });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Informe o motivo da pausa');
      field.current?.focus();
      return;
    }
    onConfirm(parsed.data.reason);
  };

  return (
    <ConfirmDialog
      isOpen={isOpen}
      type="danger"
      title={`Pausar ${siteId}?`}
      confirmText="Pausar"
      confirmButtonProps={dangerConfirmButtonProps}
      onCancel={onCancel}
      onConfirm={confirm}
      onAfterClose={onAfterClose}
    >
      <p className="mb-4">
        O site para de receber builds até ser retomado: o que está no ar continua, e o build na fila
        é ignorado. O motivo fica na linha Site do painel.
      </p>
      <FormContainer>
        <FormItem
          label="Motivo"
          asterisk
          className="mb-0"
          invalid={error !== null}
          errorMessage={error ?? undefined}
        >
          <Input
            ref={field}
            textArea
            rows={3}
            required
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              if (error !== null) setError(null);
            }}
          />
        </FormItem>
      </FormContainer>
    </ConfirmDialog>
  );
}
