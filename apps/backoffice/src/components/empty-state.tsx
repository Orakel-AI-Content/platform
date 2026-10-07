import type { ReactNode } from 'react';

// Estado vazio das listas (#87): no lugar da tabela sem linhas, a mensagem e, quando quem
// pede pode criar, a mesma ação principal do cabeçalho. Sem estado próprio: serve a Server e
// a Client Components.

export function EmptyState({
  children,
  action,
}: {
  /** O que falta na lista ("Nenhum autor cadastrado."). */
  children: ReactNode;
  /** A ação principal da tela, só com permissão. */
  action?: ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-md border border-dashed border-border px-6 py-10 text-center">
      <p className="text-muted-foreground">{children}</p>
      {action && <div className="flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
