// Ecme v1.3.10 (e5f9a1d): src/components/ui/utils/chainedFunction.ts
// Adaptado (#205): tipos sem `any` (lint do monorepo); o comportamento não muda.
type AnyFunction = (this: unknown, ...args: unknown[]) => unknown;

export default function chainedFunction<T = AnyFunction>(...funcs: (T | null | undefined)[]) {
  return funcs
    .filter((f) => f !== null && typeof f !== 'undefined')
    .reduce<AnyFunction | undefined>((acc, f) => {
      if (typeof f !== 'function') {
        throw new Error('Invalid Argument Type, must only provide functions, undefined, or null.');
      }
      const next = f as AnyFunction;

      if (acc === undefined) {
        return next;
      }

      return function chainedFunction(this: unknown, ...args: unknown[]) {
        acc.apply(this, args);
        next.apply(this, args);
      };
    }, undefined);
}
