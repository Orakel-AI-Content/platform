'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';

// Botão "Enviar para revisão" da página do conteúdo (#74), no padrão das ações da página do
// site: a Server Action delega ao domínio e o retorno é anunciado em role=status. A página o
// monta para quem tem content.write; o botão só aparece com a versão mais recente em
// rascunho (`available`). Depois do envio a página revalida e `available` vira false, mas o
// componente continua montado: a mensagem de sucesso não se perde.

type SubmitResult = { ok: boolean; message: string };

export function SubmitForReview({
  available,
  action,
}: {
  available: boolean;
  action: () => Promise<SubmitResult>;
}) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<SubmitResult | null>(null);
  if (!available && status === null) return null;
  return (
    <div className="space-y-2">
      {available && (
        <Button
          size="sm"
          disabled={pending}
          onClick={() => startTransition(async () => setStatus(await action()))}
        >
          {pending ? 'Enviando…' : 'Enviar para revisão'}
        </Button>
      )}
      <p
        role="status"
        className={
          status?.ok === false ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'
        }
      >
        {status?.message}
      </p>
    </div>
  );
}
