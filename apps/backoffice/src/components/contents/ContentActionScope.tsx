'use client';

import { createContext, use, type ReactNode } from 'react';

import { ActionAlert, useActionResult } from '@/components/shared/ActionFeedback.tsx';

// Escopo das ações do cabeçalho do conteúdo ("Enviar para revisão", #74/#371; "Despublicar",
// #494), como o do ciclo de vida do site (`LifecycleActionScope`): o estado mora no escopo, que
// envolve o PageHeader, e a recusa vai a um único Alert logo abaixo da linha do título. Quando a
// página revalida e o botão some (enviado, despublicado), o erro e o toast continuam.

export type ContentAction = ReturnType<typeof useActionResult>;

const ContentActionContext = createContext<ContentAction | null>(null);

/** Guarda o estado das ações e mostra a recusa no Alert, sempre montado, abaixo de `children`. */
export function ContentActionScope({ children }: { children: ReactNode }) {
  const state = useActionResult();
  return (
    <ContentActionContext value={state}>
      {children}
      <ActionAlert error={state.error} />
    </ContentActionContext>
  );
}

/** O estado do escopo; `who` nomeia o componente no erro de quem o usa fora dele. */
export function useContentAction(who: string): ContentAction {
  const scope = use(ContentActionContext);
  if (scope === null) throw new Error(`${who} fora de um ContentActionScope.`);
  return scope;
}
