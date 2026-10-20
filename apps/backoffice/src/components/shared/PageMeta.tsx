import { Fragment, type ReactNode } from 'react';

import classNames from '@/components/ui/utils/classNames';

/**
 * Linha de metadados sob o título de uma tela (#368): texto de apoio no cinza do body (com a
 * substituição do docs/migration/ecme.md), em `text-sm`, com os itens separados por " · ". O
 * separador é `aria-hidden`, para o leitor de tela não ler "ponto". Um item pode ser um nó
 * rico, como a `StateTag` do estado; por isso a linha e os itens são `div`, e não `p` e `span`:
 * a `Tag` do Ecme é um `div`. Itens vazios (`null`, `false`, `''`) ficam de fora, sem separador
 * sobrando. Sem estado próprio: serve a Server e a Client Components.
 */
export function PageMeta({
  items,
  className,
}: {
  items: readonly ReactNode[];
  className?: string;
}) {
  const shown = items.filter(
    (item) => item !== null && item !== undefined && item !== false && item !== '',
  );
  if (shown.length === 0) return null;
  return (
    <div
      className={classNames(
        'flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-600 wrap-anywhere dark:text-gray-400',
        className,
      )}
    >
      {shown.map((item, index) => (
        <Fragment key={index}>
          {index > 0 && <span aria-hidden="true">·</span>}
          <div className="min-w-0">{item}</div>
        </Fragment>
      ))}
    </div>
  );
}
