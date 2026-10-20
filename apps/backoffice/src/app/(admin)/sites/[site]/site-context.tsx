'use client';

// O site da URL para os componentes cliente abaixo do layout do site (#381): o not-found não
// recebe params e cita o site pelo nome. O layout já leu o site (`lookupSite`, em `cache`);
// só o id e o nome passam ao cliente.
import { createContext, useContext, type ReactNode } from 'react';

import type { SiteSummary } from '@/domain/sites/sites.ts';

export type SiteRef = Pick<SiteSummary, 'id' | 'name'>;

const SiteContext = createContext<SiteRef | null>(null);

export function SiteProvider({ site, children }: { site: SiteRef; children: ReactNode }) {
  return <SiteContext.Provider value={site}>{children}</SiteContext.Provider>;
}

/** O site do layout. Fora dele não há site: o layout só fornece quando o site existe. */
export function useSite(): SiteRef {
  const site = useContext(SiteContext);
  if (site === null) throw new Error('useSite fora do layout do site');
  return site;
}
