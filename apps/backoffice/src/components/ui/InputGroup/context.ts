// Ecme v1.3.10 (e5f9a1d): src/components/ui/InputGroup/context.ts
'use client';

import { createContext, useContext } from 'react';
import type { TypeAttributes } from '../@types/common';

const InputGroupContext = createContext<{
  size?: TypeAttributes.ControlSize;
} | null>(null);

export const InputGroupContextProvider = InputGroupContext.Provider;

export const InputGroupContextConsumer = InputGroupContext.Consumer;

export function useInputGroup() {
  return useContext(InputGroupContext);
}

export default InputGroupContext;
