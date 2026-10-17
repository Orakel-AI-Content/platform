// Ecme v1.3.10 (e5f9a1d): src/components/ui/Checkbox/context.tsx
'use client';

import { createContext } from 'react';
import type { ChangeEvent } from 'react';

export type CheckboxValue = string | number | boolean;
export type CheckboxGroupValue = string[];

export interface CheckboxGroupContextProps {
  checkboxClass?: string;
  name?: string;
  onChange?: (value: CheckboxValue, checked: boolean, event: ChangeEvent<HTMLInputElement>) => void;
  value?: CheckboxGroupValue;
  vertical?: boolean;
}

const CheckboxGroupContext = createContext<CheckboxGroupContextProps>({});

export const CheckboxGroupContextProvider = CheckboxGroupContext.Provider;

export default CheckboxGroupContext;
