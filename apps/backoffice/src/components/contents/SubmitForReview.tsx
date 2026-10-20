'use client';

import type { ActionResult } from '@/components/shared/actionResult.ts';
import { ActionAlert, useActionResult } from '@/components/shared/ActionFeedback.tsx';
import { Button } from '@/components/ui/Button';

// Botão "Enviar para revisão" da página do conteúdo (#74), no retorno padrão das ações: a
// Server Action delega ao domínio, o sucesso vai para o toast e a recusa para o Alert junto
// do botão. A página o monta para quem tem content.write; o botão só aparece com a versão
// mais recente em rascunho (`available`). Depois do envio a página revalida e `available`
// vira false; o toast, no layout raiz, continua.

export function SubmitForReview({
  available,
  action,
}: {
  available: boolean;
  action: () => Promise<ActionResult>;
}) {
  const { pending, error, run } = useActionResult();
  if (!available && error === null) return null;
  return (
    <div className="space-y-2">
      {available && (
        <Button
          type="button"
          variant="solid"
          size="sm"
          disabled={pending}
          onClick={() => run(action)}
        >
          {pending ? 'Enviando para revisão…' : 'Enviar para revisão'}
        </Button>
      )}
      <ActionAlert error={error} />
    </div>
  );
}
