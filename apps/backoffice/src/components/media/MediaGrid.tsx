import type { ReactNode } from 'react';

import classNames from '@/components/ui/utils/classNames';

// Grade de miniaturas da mídia (#374): a mesma na biblioteca e no seletor do editor. Um tamanho
// só de coluna, 9rem no mínimo: três colunas na largura padrão do `Dialog` (520 px) e, na
// página, entre os dois tamanhos que havia antes. Os itens (`<li>`) vêm de quem usa.

export function MediaGrid({
  label,
  className,
  children,
}: {
  /** Nome da lista ("Imagens do site", "Imagens da biblioteca"). */
  label: string;
  className?: string;
  /** Os `<li>` da grade. */
  children: ReactNode;
}) {
  return (
    <ul
      aria-label={label}
      className={classNames('grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-4', className)}
    >
      {children}
    </ul>
  );
}
