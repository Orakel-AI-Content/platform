// Ecme v1.3.10 (e5f9a1d): src/components/ui/Dropdown/context/menuContext.ts
// Adaptado (#241): fora de um menu, o `getItemProps` padrão devolve as props que recebe; no Ecme
// devolvia `{}`, e o gatilho de topo perdia as do `Dropdown` (ex.: o `aria-describedby` de uma
// `Tooltip` em volta dele).
'use client';

import { createContext } from 'react';
import type { Dispatch, HTMLProps, SetStateAction } from 'react';

export type MenuContextProps = {
  getItemProps: (userProps?: HTMLProps<HTMLElement>) => Record<string, unknown>;
  activeIndex: number | null;
  setActiveIndex: Dispatch<SetStateAction<number | null>>;
  setHasFocusInside: Dispatch<SetStateAction<boolean>>;
  isOpen: boolean;
};

const MenuContext = createContext<MenuContextProps>({
  getItemProps: (userProps) => ({ ...userProps }),
  activeIndex: null,
  setActiveIndex: () => {},
  setHasFocusInside: () => {},
  isOpen: false,
});

export const MenuContextProvider = MenuContext.Provider;

export default MenuContext;
