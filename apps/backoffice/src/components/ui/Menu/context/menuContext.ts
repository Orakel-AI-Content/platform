// Ecme v1.3.10 (e5f9a1d): src/components/ui/Menu/context/menuContext.tsx
// Adaptado (#235): `onSelect` com o evento do React, como o MenuItem portado (#210).
'use client';

import { createContext } from 'react';
import type { MouseEvent } from 'react';

export interface MenuContextProps {
  defaultActiveKeys?: Array<string>;
  defaultExpandedKeys?: Array<string>;
  defaultCollapseActiveKeys?: Array<string>;
  menuItemHeight?: number;
  onSelect?: (eventKey: string, e: MouseEvent) => void;
  sideCollapsed?: boolean;
}

const MenuContext = createContext<MenuContextProps>({});

export const MenuContextProvider = MenuContext.Provider;

export const MenuContextConsumer = MenuContext.Consumer;

export default MenuContext;
