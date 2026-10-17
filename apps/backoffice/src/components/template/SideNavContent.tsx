// Conteúdo da barra lateral (#242; workspace#46): `nav "Principal"` com os itens globais e,
// dentro de um site que a pessoa vê, o seletor de site e `nav "Áreas do site"`. Sai da SideNav
// para ser o mesmo na barra fixa e no Drawer do celular (`MobileNav`), como o Ecme usa o mesmo
// `VerticalMenuContent` nos dois. No 404 de site e em `/sites/novo`, o segmento não é um dos
// sites, e as áreas não aparecem.
'use client';

import { usePathname } from 'next/navigation';
import classNames from '@/components/ui/utils/classNames';
import VerticalMenuContent from '@/components/template/VerticalMenuContent';
import { SiteSwitcher, type SwitcherSite } from '@/components/site-switcher';
import {
  activeNavigationKey,
  NAV_ITEM_TYPE_TITLE,
  type NavigationTree,
} from '@/configs/navigation.config';

export type SideNavContentProps = {
  /** Árvore de navegação já filtrada para quem pede (`filterNavigation`). */
  navigationTree: NavigationTree[];
  /** Sites que quem pede pode ver (`listSites`): o seletor e o site atual. */
  sites: readonly SwitcherSite[];
  collapsed?: boolean;
  /** Clique num item da navegação (o Drawer do celular fecha). */
  onMenuItemClick?: () => void;
};

/** O site do endereço (`/sites/<site>/…`), se for um dos que a pessoa vê. */
function currentSite(pathname: string, sites: readonly SwitcherSite[]): SwitcherSite | undefined {
  const [, root, siteId] = pathname.split('/');
  return root === 'sites' ? sites.find((site) => site.id === siteId) : undefined;
}

const SideNavContent = ({
  navigationTree,
  sites,
  collapsed = false,
  onMenuItemClick,
}: SideNavContentProps) => {
  const pathname = usePathname();
  const site = currentSite(pathname, sites);
  const activeKey = activeNavigationKey(pathname, navigationTree);
  const globalItems = navigationTree.filter((nav) => nav.type !== NAV_ITEM_TYPE_TITLE);
  const siteGroups = navigationTree.filter((nav) => nav.type === NAV_ITEM_TYPE_TITLE);

  return (
    <>
      <VerticalMenuContent
        aria-label="Principal"
        collapsed={collapsed}
        activeKey={activeKey}
        navigationTree={globalItems}
        onMenuItemClick={onMenuItemClick}
      />
      {site && (
        <>
          <div className={classNames('flex', collapsed ? 'justify-center' : 'px-4')}>
            <SiteSwitcher current={site} sites={sites} collapsed={collapsed} />
          </div>
          <VerticalMenuContent
            aria-label="Áreas do site"
            collapsed={collapsed}
            activeKey={activeKey}
            navigationTree={siteGroups}
            siteId={site.id}
            onMenuItemClick={onMenuItemClick}
          />
        </>
      )}
    </>
  );
};

export default SideNavContent;
