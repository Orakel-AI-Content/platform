import type { ReactNode } from 'react';

import FileNotFound from '@/assets/svg/FileNotFound';

// Estado vazio das listas, numa regra só (#87, #361):
// - lista vazia (nada cadastrado): `EmptyState` no lugar da toolbar e da tabela, com a mensagem
//   e, quando quem pede pode criar, a mesma ação principal do cabeçalho;
// - busca ou filtro sem resultado: a tabela fica, com a contagem "0 resultados", e o
//   `NoResults` vai no `customNoDataIcon` do DataTable (o `noData` do Ecme). Só a mensagem: a
//   ação de limpar é a "Limpar filtros" da `ListToolbar`, que já aparece só com busca ou filtro
//   ativo, e não se repete aqui.
// Sem estado próprio: servem a Server e a Client Components. O Ecme não tem estado de lista
// vazia (#247): a borda é a do cartão do template, e o texto, o do body (com a substituição do
// docs/migration/ecme.md).

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
      <p>{children}</p>
      {action && <div className="flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/** Busca ou filtro sem resultado, dentro do DataTable: a ilustração do Ecme e a mensagem. */
export function NoResults({
  children,
}: {
  /** O que não foi achado ("Nenhum autor encontrado."). */
  children: ReactNode;
}) {
  return (
    <>
      <FileNotFound />
      <span className="font-semibold">{children}</span>
    </>
  );
}
