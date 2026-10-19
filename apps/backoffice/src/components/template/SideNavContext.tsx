'use client';

// Estado da barra lateral (#238; workspace#46): recolhida ou expandida. No Ecme fica no
// `themeStore` (zustand, `layout.sideNavCollapse`, persistido); aqui é um contexto cliente da
// moldura, abaixo do layout do admin, que não remonta entre navegações pelo cliente. Sem
// persistência: ao recarregar, a barra volta expandida.
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/** `id` da barra, para o `aria-controls` do toggle. */
export const SIDE_NAV_ID = 'barra-lateral';

type SideNavState = { collapsed: boolean; setCollapsed: (collapsed: boolean) => void };

const SideNavContext = createContext<SideNavState>({ collapsed: false, setCollapsed: () => {} });

export function SideNavProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const value = useMemo(() => ({ collapsed, setCollapsed }), [collapsed]);
  return <SideNavContext.Provider value={value}>{children}</SideNavContext.Provider>;
}

export function useSideNav(): SideNavState {
  return useContext(SideNavContext);
}
