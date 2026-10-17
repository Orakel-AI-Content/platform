// Ecme v1.3.10 (e5f9a1d): src/components/layouts/PostLoginLayout/components/CollapsibleSide.tsx
// Adaptado (#237; workspace#46): a moldura do Backoffice. Sem `LayoutBase`/`useLayout` (um layout
// só) nem `useResponsive`: a barra aparece em todas as larguras até o Drawer do celular (#242).
// O Header recebe pronto o que mostra à direita (e-mail, papéis e "Sair"); a busca, o idioma, as
// notificações, o painel lateral e o recolher não entram (o recolher é da #238).
import SideNav from '@/components/template/SideNav';
import Header from '@/components/template/Header';
import type { SwitcherSite } from '@/components/site-switcher';
import type { NavigationTree } from '@/configs/navigation.config';
import type { ReactNode } from 'react';

type CollapsibleSideProps = {
  children: ReactNode;
  headerEnd?: ReactNode;
  navigationTree: NavigationTree[];
  sites: readonly SwitcherSite[];
};

const CollapsibleSide = ({ children, headerEnd, navigationTree, sites }: CollapsibleSideProps) => {
  return (
    <div className="app-layout-collapsible-side flex flex-auto flex-col">
      <div className="flex flex-auto min-w-0">
        <SideNav navigationTree={navigationTree} sites={sites} />
        <div className="flex flex-col flex-auto min-h-screen min-w-0 relative w-full">
          <Header className="shadow-sm dark:shadow-2xl" headerEnd={headerEnd} />
          <div className="h-full flex flex-auto flex-col">{children}</div>
        </div>
      </div>
    </div>
  );
};

export default CollapsibleSide;
