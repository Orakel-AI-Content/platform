import type { ReactNode } from 'react';

// Grade das telas de detalhe (site, conteúdo e revisão, #370, #371, #373; #460): o resumo e o
// corpo do `CustomerDetails` do Ecme, um sobre o outro até `xl` e lado a lado a partir dele. A
// coluna de resumo leva `DETAIL_SUMMARY_CLASS` (`detailSummary.ts`); a ordem dos dois é a de
// quem usa. Sem estado próprio: serve aos Server Components das páginas.

export function DetailLayout({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4 xl:flex-row">{children}</div>;
}
