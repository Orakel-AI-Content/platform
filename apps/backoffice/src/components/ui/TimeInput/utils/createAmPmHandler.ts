// Ecme v1.3.10 (e5f9a1d): src/components/ui/TimeInput/utils/createAmPmHandler.ts
// Adaptado (#316), pelo lint: `onChange` como propriedade (não método) e o foco no campo
// seguinte em `if`, não em `&&`.
import type { RefObject } from 'react';

type CreateAmPmHandlerParams = {
  amLabel: string;
  pmLabel: string;
  onChange: (value: string) => void;
  nextRef?: RefObject<HTMLInputElement | null>;
};

export function createAmPmHandler({
  amLabel,
  pmLabel,
  onChange,
  nextRef,
}: CreateAmPmHandlerParams) {
  return (value: string, triggerShift: boolean) => {
    const testRegex = new RegExp(`(^(${amLabel}|${pmLabel})?$)`);
    const valLower = value.toLowerCase();

    if (valLower === amLabel || valLower === pmLabel) {
      onChange(valLower);
      if (triggerShift) {
        nextRef?.current?.focus();
        nextRef?.current?.select();
      }
      return;
    }

    if (!testRegex.test(valLower)) {
      return;
    }

    onChange(valLower);
  };
}
