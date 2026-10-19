// Ecme v1.3.10 (e5f9a1d): src/components/ui/Radio/context.tsx
// Adaptado (#315), pelos tipos: o valor é `RadioValue` (`string | number`, o que o atributo
// `value` do <input> aceita), no lugar de `any`; o evento de `onChange` é o `ChangeEvent` que o
// <input> dispara (o Ecme o tipava como `MouseEvent`).
'use client';

import { createContext } from 'react';
import type { ChangeEvent } from 'react';

export type RadioValue = string | number;

type RadioGroupContextProps = {
  vertical?: boolean;
  name?: string;
  value?: RadioValue | null;
  radioClass?: string;
  disabled?: boolean;
  onChange?: (nextValue: RadioValue, e: ChangeEvent<HTMLInputElement>) => void;
};

const RadioGroupContext = createContext<RadioGroupContextProps>({});

export const RadioGroupContextProvider = RadioGroupContext.Provider;

export default RadioGroupContext;
