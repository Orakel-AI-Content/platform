'use client';

import { useEffect } from 'react';

import { navigationTarget } from '@/components/shared/navigationTarget.ts';

// Aviso ao sair com alterações não salvas (#111): fechar a aba ou recarregar dispara a
// confirmação do navegador (`beforeunload`), e o clique num link interno pergunta antes de
// navegar. O Voltar do navegador fica de fora: o App Router não deixa bloquear a navegação.

export const LEAVE_MESSAGE = 'Há alterações não salvas. Sair do editor e perdê-las?';

/** Liga o aviso enquanto `active` (no editor, `formState.isDirty`). */
export function useLeaveGuard(active: boolean, message = LEAVE_MESSAGE): void {
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      // O navegador mostra a própria mensagem; o texto não é usado.
      event.preventDefault();
    };
    // No `window` e na captura: antes do `NavigationIndicator` (document) e do `Link` do Next
    // (React). Ficar cancela o clique inteiro: nem navega nem acende "Carregando…".
    const onClick = (event: MouseEvent) => {
      if (!navigationTarget(event) || window.confirm(message)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('click', onClick, { capture: true });
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('click', onClick, { capture: true });
    };
  }, [active, message]);
}
