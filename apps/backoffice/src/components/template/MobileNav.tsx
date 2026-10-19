// Ecme v1.3.10 (e5f9a1d): src/components/template/MobileNav.tsx
// Adaptado (#242; workspace#46):
// - um <button> nativo com nome fixo e `aria-expanded` (o Ecme usava um <div> com `onClick`,
//   fora do Tab), com as classes do `SideNavToggle`; sem `withHeaderItem` nem `useResponsive`:
//   quem esconde a partir de `lg` é a moldura, por classe;
// - a árvore (já filtrada pelo RBAC) e os sites vêm por props, sem os stores do template; o
//   Drawer mostra o mesmo conteúdo da barra expandida (`SideNavContent`), com o seletor de site;
// - sem `Suspense`/`lazy` nem RTL (o Backoffice é só pt-BR): o Drawer fica à esquerda;
// - fecha ao clicar num item e também quando a rota muda, o que cobre a troca de site pelo
//   seletor, cujo menu abre fora do Drawer.
'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import NavToggle from '@/components/shared/NavToggle';
import Drawer from '@/components/ui/Drawer';
import classNames from '@/components/ui/utils/classNames';
import type { SwitcherSite } from '@/components/template/SiteSwitcher';
import type { NavigationTree } from '@/configs/navigation.config';
import SideNavContent from './SideNavContent';

type MobileNavProps = {
  navigationTree: NavigationTree[];
  sites: readonly SwitcherSite[];
  className?: string;
};

const MobileNav = ({ navigationTree, sites, className }: MobileNavProps) => {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);

  // Navegou com o Drawer aberto (item ou seletor de site): fecha.
  if (openedAt !== pathname) {
    setOpenedAt(pathname);
    if (isOpen) setIsOpen(false);
  }

  const handleDrawerClose = () => {
    setIsOpen(false);
  };

  return (
    <>
      <button
        type="button"
        aria-label="Menu de navegação"
        aria-expanded={isOpen}
        className={classNames(
          'header-action-item header-action-item-hoverable text-gray-600 dark:text-gray-400',
          className,
        )}
        onClick={() => setIsOpen(true)}
      >
        <NavToggle className="text-2xl" toggled={isOpen} />
      </button>
      <Drawer
        title="Navegação"
        isOpen={isOpen}
        bodyClass="p-0"
        width={330}
        placement="left"
        onClose={handleDrawerClose}
        onRequestClose={handleDrawerClose}
      >
        {isOpen && (
          <SideNavContent
            navigationTree={navigationTree}
            sites={sites}
            onMenuItemClick={handleDrawerClose}
          />
        )}
      </Drawer>
    </>
  );
};

export default MobileNav;
