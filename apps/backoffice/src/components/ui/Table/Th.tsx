// Ecme v1.3.10 (e5f9a1d): src/components/ui/Table/Th.tsx
// Adaptado (#213), pela acessibilidade:
// - `scope="col"` por padrão no <th>, para o leitor de tela ligar a célula ao cabeçalho; o de
//   linha passa `scope="row"`;
// - `sort` vira `aria-sort` no próprio cabeçalho, o único papel em que o atributo vale. O Ecme
//   só trocava o ícone do Sorter, que aqui fica decorativo.
import type { ComponentPropsWithRef, ElementType } from 'react';

export type ThSort = 'asc' | 'desc' | 'none';

const ARIA_SORT = { asc: 'ascending', desc: 'descending', none: 'none' } as const;

export interface ThProps extends ComponentPropsWithRef<'th'> {
  asElement?: ElementType;
  sort?: ThSort;
}

const Th = (props: ThProps) => {
  const { asElement: Component = 'th', children, ref, scope, sort, ...rest } = props;

  return (
    <Component
      scope={Component === 'th' ? (scope ?? 'col') : scope}
      aria-sort={sort === undefined ? undefined : ARIA_SORT[sort]}
      {...rest}
      ref={ref}
    >
      {children}
    </Component>
  );
};

export default Th;
