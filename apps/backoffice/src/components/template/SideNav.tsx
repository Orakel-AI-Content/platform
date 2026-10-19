// Ecme v1.3.10 (e5f9a1d): src/components/template/SideNav.tsx
// Adaptado (#237; workspace#46):
// - sem os stores do template: a árvore (já filtrada pelo RBAC) e os sites vêm do servidor por
//   props, e a rota sai do `usePathname()`;
// - a marca é o texto "Orakel Backoffice" (link para `/sites`), sem o `Logo` em imagem;
// - dois landmarks: `nav "Principal"` com os itens globais e, dentro de um site que a pessoa vê,
//   o seletor de site e `nav "Áreas do site"` com os grupos da árvore (`SideNavContent`, o mesmo
//   do Drawer do celular, #242);
// - sem `ScrollBar`: o conteúdo rola com `overflow-y-auto` nativo (`side-nav-content`);
// - recolhida (#238), 80px: a marca vira "OB" (o nome fica em `sr-only`), os itens só com o
//   ícone e a dica, sem o rótulo do grupo; o seletor de site (#241) vira as iniciais do site,
//   com o mesmo nome e a dica. O estado vem do contexto da moldura (`useSideNav`) e chega ao
//   seletor por prop.
'use client';

import Link from 'next/link';
import classNames from '@/components/ui/utils/classNames';
import type { SwitcherSite } from '@/components/template/SiteSwitcher';
import type { NavigationTree } from '@/configs/navigation.config';
import SideNavContent from './SideNavContent';
import {
  HEADER_HEIGHT,
  LOGO_X_GUTTER,
  SIDE_NAV_COLLAPSED_WIDTH,
  SIDE_NAV_CONTENT_GUTTER,
  SIDE_NAV_WIDTH,
} from './constants';
import { SIDE_NAV_ID, useSideNav } from './SideNavContext';

type SideNavProps = {
  /** Árvore de navegação já filtrada para quem pede (`filterNavigation`). */
  navigationTree: NavigationTree[];
  /** Sites que quem pede pode ver (`listSites`): o seletor e o site atual. */
  sites: readonly SwitcherSite[];
  background?: boolean;
  className?: string;
  contentClass?: string;
};

const sideNavStyle = {
  width: SIDE_NAV_WIDTH,
  minWidth: SIDE_NAV_WIDTH,
};

const sideNavCollapseStyle = {
  width: SIDE_NAV_COLLAPSED_WIDTH,
  minWidth: SIDE_NAV_COLLAPSED_WIDTH,
};

const SideNav = ({
  navigationTree,
  sites,
  background = true,
  className,
  contentClass,
}: SideNavProps) => {
  const { collapsed } = useSideNav();

  return (
    <div
      id={SIDE_NAV_ID}
      style={collapsed ? sideNavCollapseStyle : sideNavStyle}
      className={classNames(
        'side-nav flex',
        !collapsed && 'side-nav-expand',
        background && 'side-nav-bg',
        className,
      )}
    >
      <Link
        href="/sites"
        className={classNames(
          'side-nav-header flex flex-col justify-center text-xl font-bold text-gray-900 dark:text-gray-100',
          collapsed ? `${SIDE_NAV_CONTENT_GUTTER} items-center` : LOGO_X_GUTTER,
        )}
        style={{ height: HEADER_HEIGHT }}
      >
        {collapsed ? (
          <>
            <span aria-hidden="true">OB</span>
            <span className="sr-only">Orakel Backoffice</span>
          </>
        ) : (
          'Orakel Backoffice'
        )}
      </Link>
      <div className={classNames('side-nav-content', contentClass)}>
        <SideNavContent navigationTree={navigationTree} sites={sites} collapsed={collapsed} />
      </div>
    </div>
  );
};

export default SideNav;
