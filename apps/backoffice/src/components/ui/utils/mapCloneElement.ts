// Ecme v1.3.10 (e5f9a1d): src/components/ui/utils/mapCloneElement.ts
// Adaptado (#205): tipos sem `any` (lint do monorepo); o comportamento não muda.
import { Children, isValidElement, cloneElement } from 'react';
import type { ReactElement, ReactNode } from 'react';

type Mapper<R> = (this: unknown, child: ReactElement, index: number) => R;

function map<R>(children: ReactNode, func: Mapper<R>, context?: unknown) {
  let index = 0;
  return Children.map(children, (child) => {
    if (!isValidElement(child)) {
      return child;
    }
    const handle = func.call(context, child, index);
    index += 1;
    return handle;
  });
}

function mapCloneElement(
  children: ReactNode,
  func: (child: ReactElement, index: number) => Record<string, unknown> | undefined,
  context?: unknown,
) {
  return map(
    children,
    (child, index) =>
      cloneElement(child, {
        key: index,
        ...func(child, index),
      }),
    context,
  );
}

export default mapCloneElement;
