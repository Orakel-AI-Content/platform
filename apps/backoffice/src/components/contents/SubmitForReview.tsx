'use client';

import type { ActionResult } from '@/components/shared/actionResult.ts';
import { Button } from '@/components/ui/Button';

import { useContentAction } from './ContentActionScope.tsx';

// "Enviar para revisão" da página do conteúdo (#74), no retorno padrão das ações: a Server
// Action delega ao domínio, o sucesso vai para o toast e a recusa para o Alert do
// `ContentActionScope`, que envolve o cabeçalho (#371). A página monta o botão para quem tem
// content.write; ele só aparece com a versão mais recente em rascunho (`available`). Depois do
// envio a página revalida e `available` vira false; o toast, no layout raiz, continua.

/** O botão, dentro de um `ContentActionScope`; sem rascunho, não renderiza nada. */
export function SubmitForReview({
  available,
  action,
}: {
  available: boolean;
  action: () => Promise<ActionResult>;
}) {
  const scope = useContentAction('SubmitForReview');
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
