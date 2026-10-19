// Ecme v1.3.10 (e5f9a1d): src/components/layouts/PostLoginLayout/components/CollapsibleSide.tsx
// Adaptado (#237; workspace#46): a moldura do Backoffice. Sem `LayoutBase`/`useLayout` (um layout
// só) nem `useResponsive`: abaixo de `lg`, a barra e o toggle de recolher somem por classe e o
// `MobileNav` abre a mesma navegação num Drawer (#242).
// O Header recebe pronto o que mostra à direita (e-mail, papéis e "Sair") e, à esquerda, o
// toggle de recolher (#238), com o estado num contexto cliente (`SideNavProvider`); a busca, o
// idioma, as notificações e o painel lateral não entram.
import SideNav from '@/components/template/SideNav';
import Header from '@/components/template/Header';
import SideNavToggle from '@/components/template/SideNavToggle';
import MobileNav from '@/components/template/MobileNav';
import { SideNavProvider } from '@/components/template/SideNavContext';
import type { SwitcherSite } from '@/components/template/SiteSwitcher';
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
    <SideNavProvider>
      <div className="app-layout-collapsible-side flex flex-auto flex-col">
        <div className="flex flex-auto min-w-0">
          <SideNav className="hidden lg:flex" navigationTree={navigationTree} sites={sites} />
          <div className="flex flex-col flex-auto min-h-screen min-w-0 relative w-full">
            <Header
              className="shadow-sm dark:shadow-2xl"
              headerStart={
                <>
                  <MobileNav className="lg:hidden" navigationTree={navigationTree} sites={sites} />
                  <SideNavToggle className="hidden lg:flex" />
                </>
              }
              headerEnd={headerEnd}
            />
            <div className="h-full flex flex-auto flex-col">{children}</div>
          </div>
        </div>
      </div>
    </SideNavProvider>
  );
};

export default CollapsibleSide;
