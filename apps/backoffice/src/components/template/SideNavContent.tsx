// Conteúdo da barra lateral (#242; workspace#46): `nav "Principal"` com os itens globais e,
// dentro de um site que a pessoa vê, o seletor de site e `nav "Áreas do site"`. Sai da SideNav
// para ser o mesmo na barra fixa e no Drawer do celular (`MobileNav`), como o Ecme usa o mesmo
// `VerticalMenuContent` nos dois. No 404 de site e em `/sites/novo`, o segmento não é um dos
// sites, e as áreas não aparecem. Da contagem de todos os sites (`reviewCounts`), o site do
// endereço dá o selo do item Revisão (#583); sem conteúdo na fila, sem selo.
'use client';

import { usePathname } from 'next/navigation';
import classNames from '@/components/ui/utils/classNames';
import VerticalMenuContent from '@/components/template/VerticalMenuContent';
import type { NavItemCount } from '@/components/template/VerticalMenuContent/VerticalSingleMenuItem';
import { SiteSwitcher, type SwitcherSite } from '@/components/template/SiteSwitcher';
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
  /** Tamanho da fila de revisão por site (`countReviewQueues`): o selo do item Revisão. */
  reviewCounts?: Readonly<Record<string, number>>;
  collapsed?: boolean;
  /** Clique num item da navegação (o Drawer do celular fecha). */
  onMenuItemClick?: () => void;
};

/** Chave do item Revisão em `navigationConfig`. */
const REVIEW_NAV_KEY = 'site.review';

/** O selo do item Revisão: o tamanho da fila do site, só quando há conteúdo nela. */
function reviewItemCounts(pending: number): Readonly<Record<string, NavItemCount>> | undefined {
  return pending > 0
    ? { [REVIEW_NAV_KEY]: { count: pending, label: `${pending} aguardando` } }
    : undefined;
}

/** O site do endereço (`/sites/<site>/…`), se for um dos que a pessoa vê. */
function currentSite(pathname: string, sites: readonly SwitcherSite[]): SwitcherSite | undefined {
  const [, root, siteId] = pathname.split('/');
  return root === 'sites' ? sites.find((site) => site.id === siteId) : undefined;
}

const SideNavContent = ({
  navigationTree,
  sites,
  reviewCounts = {},
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
            itemCounts={reviewItemCounts(reviewCounts[site.id] ?? 0)}
            onMenuItemClick={onMenuItemClick}
          />
        </>
      )}
    </>
  );
};

export default SideNavContent;
