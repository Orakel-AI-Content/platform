import type { ReactNode } from 'react';

// Estado vazio das listas (#87): no lugar da tabela sem linhas, a mensagem e, quando quem
// pede pode criar, a mesma ação principal do cabeçalho. Sem estado próprio: serve a Server e
// a Client Components. O Ecme não tem estado vazio (#247): a borda é a do cartão do template, e
// o texto, o do body (com a substituição do docs/migration/ecme.md).

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
    <div className="space-y-3 rounded-2xl border border-dashed border-gray-200 px-6 py-10 text-center dark:border-gray-800">
      <p className="text-gray-600 dark:text-gray-400">{children}</p>
      {action && <div className="flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
