// Ecme v1.3.10 (e5f9a1d): src/components/ui/TimeInput/utils/createTimeHandler.ts
// Adaptado (#316), pelo lint: `onChange` como propriedade (não método) e o foco no campo
// seguinte em `if`, não em `&&`.
import { padTime } from './padTime';
import { clamp } from '../../utils/clamp';
import type { RefObject } from 'react';

function allButLastDigit(value: number) {
  return Math.floor(value / 10);
}

type CreateTimeHandlerParams = {
  onChange: (value: string, carryOver?: string) => void;
  nextRef?: RefObject<HTMLInputElement | null>;
  min: number;
  max: number;
  nextMax?: number;
};

export function createTimeHandler({
  onChange,
  nextRef,
  min,
  max,
  nextMax,
}: CreateTimeHandlerParams) {
  return (value: string, triggerShift: boolean, forceTriggerShift = false) => {
    const parsed = parseInt(value, 10);

    if (Number.isNaN(parsed)) {
      return;
    }

    if (parsed > allButLastDigit(max) || forceTriggerShift) {
      const lastDigit = parsed % 10;

      let updatedValue;
      let carryOver;

      if (parsed > max && nextMax && lastDigit <= allButLastDigit(nextMax)) {
        updatedValue = padTime(allButLastDigit(parsed).toString());
        carryOver = padTime(lastDigit.toString());
      } else {
        updatedValue = padTime(clamp(parsed, min, max).toString());
      }

      onChange(updatedValue, carryOver);
      if (triggerShift) {
        nextRef?.current?.focus();
        nextRef?.current?.select();
      }
      return;
    }

    onChange(parsed.toString());
  };
}
