'use client';

import { useState, useTransition } from 'react';

import type { ActionResult } from '@/components/shared/actionResult.ts';
import Alert from '@/components/ui/Alert';
import Notification from '@/components/ui/Notification';
import toast from '@/components/ui/toast';

// Retorno padrão das ações: sucesso no toast (o ToastProvider já é a região `role="status"`,
// anunciada mesmo com diálogo aberto) e erro num Alert do Ecme junto da ação.

/** Mostra o sucesso no toast, como `toast.push(<Notification type="success">)` do Ecme. */
export function pushSuccess(message: string): void {
  toast.push(<Notification type="success" title={message} />);
}

/**
 * Roda a ação numa transição: o sucesso vai para o toast e o erro fica em `error`, para o
 * `ActionAlert` junto da ação. `fail` cobre a validação local; um novo `run` limpa o erro.
 * `report` entrega um resultado obtido fora do `run` (botão com a própria transição, como o
 * "Publicar agora" de cada linha da lista de sites).
 */
export function useActionResult() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const report = (result: ActionResult) => {
    if (result.ok) {
      setError(null);
      pushSuccess(result.message);
    } else {
      setError(result.message);
    }
  };
  const run = (action: () => Promise<ActionResult>) => {
    setError(null);
    startTransition(async () => report(await action()));
  };
  return { pending, error, run, report, fail: setError };
}

/**
 * Erro da ação no `Alert` do Ecme. O Alert não tem papel de região viva: o `role="alert"` fica
 * num contêiner sempre montado, para o leitor de tela anunciar o erro quando ele aparece.
 */
export function ActionAlert({ error, className }: { error: string | null; className?: string }) {
  return (
    <div role="alert" className={className}>
      {error !== null && (
        <Alert type="danger" showIcon duration={0}>
          {error}
        </Alert>
      )}
    </div>
  );
}
