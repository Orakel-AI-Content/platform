// Ecme v1.3.10 (e5f9a1d): src/components/ui/Dropdown/context/dropdownContext.ts
'use client';

import { createContext } from 'react';

export type DropdownContextProps = {
  activeKey?: string;
};

const DropdownContext = createContext<DropdownContextProps>({});

export const DropdownContextProvider = DropdownContext.Provider;

export default DropdownContext;
