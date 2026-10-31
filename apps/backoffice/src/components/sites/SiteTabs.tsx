'use client';

import type { ReactNode } from 'react';

import Card from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';

/**
 * Lado direito da página do site (#370): o `Card` com `Tabs` do `CustomerDetails` do Ecme, com
 * Ciclo de vida, G1, Janela de agrupamento e Limite diário (#490). Cliente porque o `Tabs` é; a página (Server
 * Component) passa o conteúdo de cada aba pronto. A aba inativa desmonta o conteúdo, como no
 * template.
 */
export function SiteTabs({
  lifecycle,
  g1,
  buildWindow,
  dailyLimit,
}: {
  lifecycle: ReactNode;
  g1: ReactNode;
  buildWindow: ReactNode;
  dailyLimit: ReactNode;
}) {
  return (
    <Card className="w-full min-w-0">
      <Tabs defaultValue="ciclo">
        <Tabs.TabList aria-label="Seções do site">
          <Tabs.TabNav value="ciclo">Ciclo de vida</Tabs.TabNav>
          <Tabs.TabNav value="g1">G1 (indexação)</Tabs.TabNav>
          <Tabs.TabNav value="janela">Janela de agrupamento</Tabs.TabNav>
          <Tabs.TabNav value="limite">Limite diário</Tabs.TabNav>
        </Tabs.TabList>
        <Tabs.TabContent value="ciclo" className="pt-4">
          {lifecycle}
        </Tabs.TabContent>
        <Tabs.TabContent value="g1" className="pt-4">
          {g1}
        </Tabs.TabContent>
        <Tabs.TabContent value="janela" className="pt-4">
          {buildWindow}
        </Tabs.TabContent>
        <Tabs.TabContent value="limite" className="pt-4">
          {dailyLimit}
        </Tabs.TabContent>
      </Tabs>
    </Card>
  );
}
