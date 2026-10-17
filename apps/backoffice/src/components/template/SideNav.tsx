// Ecme v1.3.10 (e5f9a1d): src/components/template/SideNav.tsx
// Adaptado (#237; workspace#46):
// - sem os stores do template: a árvore (já filtrada pelo RBAC) e os sites vêm do servidor por
//   props, e a rota sai do `usePathname()`;
// - a marca é o texto "Orakel Backoffice" (link para `/sites`), sem o `Logo` em imagem;
// - dois landmarks: `nav "Principal"` com os itens globais e, dentro de um site que a pessoa vê,
//   o seletor de site e `nav "Áreas do site"` com os grupos da árvore. No 404 de site e em
//   `/sites/novo`, o segmento não é um dos sites, e as áreas não aparecem;
// - sem `ScrollBar`: o conteúdo rola com `overflow-y-auto` nativo (`side-nav-content`);
// - recolhida (#238), 80px: a marca vira "OB" (o nome fica em `sr-only`), os itens só com o
//   ícone e a dica, sem o rótulo do grupo; o seletor de site fica escondido até a versão
//   recolhida dele (#241). O estado vem do contexto da moldura (`useSideNav`).
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import classNames from '@/components/ui/utils/classNames';
import VerticalMenuContent from '@/components/template/VerticalMenuContent';
import { SiteSwitcher, type SwitcherSite } from '@/components/site-switcher';
import {
  activeNavigationKey,
  NAV_ITEM_TYPE_TITLE,
  type NavigationTree,
} from '@/configs/navigation.config';
import {
  HEADER_HEIGHT,
  LOGO_X_GUTTER,
  SIDE_NAV_COLLAPSED_WIDTH,
  SIDE_NAV_CONTENT_GUTTER,
  SIDE_NAV_WIDTH,
} from './constants';
import { SIDE_NAV_ID, useSideNav } from './side-nav-context';

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

/** O site do endereço (`/sites/<site>/…`), se for um dos que a pessoa vê. */
function currentSite(pathname: string, sites: readonly SwitcherSite[]): SwitcherSite | undefined {
  const [, root, siteId] = pathname.split('/');
  return root === 'sites' ? sites.find((site) => site.id === siteId) : undefined;
}

const SideNav = ({
  navigationTree,
  sites,
  background = true,
  className,
  contentClass,
}: SideNavProps) => {
  const pathname = usePathname();
  const { collapsed } = useSideNav();
  const site = currentSite(pathname, sites);
  const activeKey = activeNavigationKey(pathname, navigationTree);
  const globalItems = navigationTree.filter((nav) => nav.type !== NAV_ITEM_TYPE_TITLE);
  const siteGroups = navigationTree.filter((nav) => nav.type === NAV_ITEM_TYPE_TITLE);

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
        <VerticalMenuContent
          aria-label="Principal"
          collapsed={collapsed}
          activeKey={activeKey}
          navigationTree={globalItems}
        />
        {site && (
          <>
            {!collapsed && (
              <div className="px-4">
                <SiteSwitcher current={site} sites={sites} />
              </div>
            )}
            <VerticalMenuContent
              aria-label="Áreas do site"
              collapsed={collapsed}
              activeKey={activeKey}
              navigationTree={siteGroups}
              siteId={site.id}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default SideNav;
