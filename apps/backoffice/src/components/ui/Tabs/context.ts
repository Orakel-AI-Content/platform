// Ecme v1.3.10 (e5f9a1d): src/components/ui/Tabs/context.ts
// Adaptado (#213): o contexto leva também `baseId`, de onde saem os ids que ligam cada aba ao
// seu painel (`aria-controls` e `aria-labelledby`).
'use client';

import { createContext, useContext } from 'react';

export type TabsVariant = 'underline' | 'pill';

export type TabsValue = string;

type TabsContextProps = {
  baseId?: string;
  onValueChange?: (tabValue: string) => void;
  value?: TabsValue;
  variant?: TabsVariant;
};

const TabsContext = createContext<TabsContextProps>({});

export const TabsContextProvider = TabsContext.Provider;

export const TabsContextConsumer = TabsContext.Consumer;

export function useTabs() {
  return useContext(TabsContext);
}

/** Ids da aba e do painel de um valor, dentro de um Tabs. */
export function tabIds(baseId: string | undefined, value: TabsValue) {
  return { tab: `${baseId}-tab-${value}`, panel: `${baseId}-panel-${value}` };
}

export default TabsContext;
