'use client';

import { createContext, use, type ReactNode } from 'react';

import type { ActionResult } from '@/components/shared/actionResult.ts';
import { ActionAlert, useActionResult } from '@/components/shared/ActionFeedback.tsx';
import { Button } from '@/components/ui/Button';

// "Enviar para revisão" da página do conteúdo (#74), no retorno padrão das ações: a Server
// Action delega ao domínio, o sucesso vai para o toast e a recusa para o Alert junto da ação.
// Na tela de detalhe (#371) o botão fica no `action` do PageHeader e o Alert abaixo da linha do
// título, como o ciclo de vida do site (`LifecycleActionScope`): o estado mora no escopo, que
// envolve o cabeçalho. A página monta o botão para quem tem content.write; ele só aparece com a
// versão mais recente em rascunho (`available`). Depois do envio a página revalida e
// `available` vira false; o toast, no layout raiz, continua.

const SubmitForReviewContext = createContext<ReturnType<typeof useActionResult> | null>(null);

/** Guarda o estado do envio e mostra a recusa no Alert, sempre montado, abaixo de `children`. */
export function SubmitForReviewScope({ children }: { children: ReactNode }) {
  const state = useActionResult();
  return (
    <SubmitForReviewContext value={state}>
      {children}
      <ActionAlert error={state.error} />
    </SubmitForReviewContext>
  );
}

/** O botão, dentro de um `SubmitForReviewScope`; sem rascunho, não renderiza nada. */
export function SubmitForReview({
  available,
  action,
}: {
  available: boolean;
  action: () => Promise<ActionResult>;
}) {
  const scope = use(SubmitForReviewContext);
  if (scope === null) throw new Error('SubmitForReview fora de um SubmitForReviewScope.');
  if (!available) return null;
  return (
    <Button
      type="button"
      variant="solid"
      size="sm"
      disabled={scope.pending}
      onClick={() => scope.run(action)}
    >
      {scope.pending ? 'Enviando para revisão…' : 'Enviar para revisão'}
    </Button>
  );
}
