'use client';

import { useState } from 'react';

import { ActionAlert } from '@/components/shared/ActionFeedback.tsx';
import ConfirmDialog, { dangerConfirmButtonProps } from '@/components/shared/ConfirmDialog.tsx';
import {
  INFRA_REMOVAL_KEPT,
  INFRA_REMOVAL_PAGES_LABEL,
  INFRA_STEP_LABEL,
  INFRA_STEP_ORDER,
  infraRemovalPagesText,
  infraStepChangesText,
} from '@/components/shared/siteLabels.ts';
import { FormContainer, FormItem } from '@/components/ui/Form';
import Input from '@/components/ui/Input';
import Spinner from '@/components/ui/Spinner';

import type { CreateInfraState } from './CreateInfraDialog.tsx';

// "Remover infraestrutura" da etapa Infra e zona (workspace#97), sobre o mesmo motor do
// `CreateInfraDialog` (`useCreateInfra`, `infraPlanState`): preparando o plano de destruição, o
// resumo do que será apagado e o erro ao preparar. É o `ConfirmDialog` `danger` do Ecme, como o
// `RollbackDialog`, com o domínio a digitar: "Remover" só fica ativo com o resumo na tela e o
// domínio exato. O texto digitado vai ao servidor, que confere de novo (`confirmInfraRemoval`).

export const REMOVE_TITLE = 'Remover a infraestrutura do site?';

export const INFRA_REMOVAL_ALREADY_CONFIRMED =
  'Esta remoção da infraestrutura já foi confirmada; o andamento aparece na etapa Infra e zona.';

export const DOMAIN_MISMATCH = 'O texto não é o domínio do site.';

export function RemoveInfraDialog({
  isOpen,
  state,
  domain,
  activePages,
  onCancel,
  onConfirm,
  onAfterClose,
}: {
  isOpen: boolean;
  state: CreateInfraState;
  /** Domínio principal do site, que é preciso digitar. */
  domain: string;
  /** Páginas no ar, apagadas com o Worker; `null` sem versão ativa. */
  activePages: number | null;
  onCancel: () => void;
  /** Só chamado com o resumo na tela e o domínio exato; recebe o texto digitado. */
  onConfirm: (typedDomain: string) => void;
  /** Depois de fechar: devolve o foco a quem abriu. */
  onAfterClose?: () => void;
}) {
  const [typed, setTyped] = useState('');
  // A cada abertura, o campo volta vazio.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setTyped('');
  }
  const value = typed.trim();
  const matches = domain !== '' && value === domain;
  // Erro só quando o texto já não pode virar o domínio: enquanto é o começo dele, sem aviso.
  const mismatch = value !== '' && !domain.startsWith(value);
  const ready = state.kind === 'resumo' && matches;

  return (
    <ConfirmDialog
      isOpen={isOpen}
      type="danger"
      title={REMOVE_TITLE}
      confirmText="Remover"
      confirmButtonProps={{ ...dangerConfirmButtonProps, disabled: !ready }}
      onCancel={onCancel}
      onConfirm={() => {
        if (ready) onConfirm(value);
      }}
      onAfterClose={onAfterClose}
    >
      <div role="status">
        {state.kind === 'preparando' && (
          <p className="flex items-center gap-2">
            <Spinner size={20} />
            Preparando o resumo do que será apagado…
          </p>
        )}
      </div>
      {state.kind === 'resumo' && (
        <>
          <p className="mb-3">
            Confira o que será apagado em cada etapa. Nada é removido antes de &quot;Remover&quot;.
          </p>
          <ul aria-label="O que será apagado" className="mb-3 flex flex-col gap-1">
            <li className="flex justify-between gap-4">
              <span className="heading-text font-semibold">{INFRA_REMOVAL_PAGES_LABEL}</span>
              <span>{infraRemovalPagesText(activePages)}</span>
            </li>
            {INFRA_STEP_ORDER.map((step) => (
              <li key={step} className="flex justify-between gap-4">
                <span className="heading-text font-semibold">{INFRA_STEP_LABEL[step]}</span>
                <span>{infraStepChangesText(state.summary.steps[step])}</span>
              </li>
            ))}
          </ul>
          <p className="mb-1">Continuam no Backoffice, para recriar a infraestrutura depois:</p>
          <ul aria-label="O que fica" className="mb-4 list-disc ps-5">
            {INFRA_REMOVAL_KEPT.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <FormContainer>
            <FormItem
              label={`Digite ${domain} para confirmar`}
              className="mb-0"
              invalid={mismatch}
              errorMessage={DOMAIN_MISMATCH}
            >
              <Input
                value={typed}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setTyped(event.target.value)}
              />
            </FormItem>
          </FormContainer>
        </>
      )}
      <ActionAlert error={state.kind === 'erro' ? state.message : null} />
    </ConfirmDialog>
  );
}
