// Ecme v1.3.10 (e5f9a1d): src/components/ui/utils/mapCloneElement.ts
// Adaptado (#321): tipado pelas props do filho, sem o `any` nem o `context` (que nenhum uso
// passa).
import { Children, cloneElement, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';

/** Clona cada filho válido com as props que `func` devolve, contando só os válidos no índice. */
function mapCloneElement<P extends object>(
  children: ReactNode,
  func: (child: ReactElement<P>, index: number) => Partial<P>,
) {
  let index = 0;
  return Children.map(children, (child) => {
    if (!isValidElement<P>(child)) {
      return child;
    }
    const cloned = cloneElement(child, { key: index, ...func(child, index) });
    index += 1;
    return cloned;
  });
}

export default mapCloneElement;
