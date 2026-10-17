// Ecme v1.3.10 (e5f9a1d): src/components/template/VerticalMenuContent/VerticalMenuContent.tsx
// Adaptado (#237; workspace#46):
// - a árvore chega filtrada do servidor (`filterNavigation`, #236), sem `AuthorityCheck` nem
//   `userAuthority`; sem i18n (`translationSetup`, `t`) e sem `collapse` (não há submenus);
// - o item ativo vem pronto (`activeKey`, de `activeNavigationKey` pelo pathname) no lugar do
//   `useMenuActive` com a chave da rota;
// - `siteId` resolve o `[site]` dos caminhos (`navigationPath`);
// - `aria-label` no <nav> do Menu: a barra tem dois landmarks, "Principal" e "Áreas do site".
'use client';

import { Fragment } from 'react';
import { Menu } from '@/components/ui/Menu';
import VerticalSingleMenuItem from './VerticalSingleMenuItem';
import {
  navigationPath,
  NAV_ITEM_TYPE_ITEM,
  NAV_ITEM_TYPE_TITLE,
  type NavigationTree,
} from '@/configs/navigation.config';

export interface VerticalMenuContentProps {
  'aria-label': string;
  activeKey?: string;
  navigationTree?: NavigationTree[];
  onMenuItemClick?: () => void;
  siteId?: string;
}

const { MenuGroup } = Menu;

const VerticalMenuContent = (props: VerticalMenuContentProps) => {
  const {
    'aria-label': ariaLabel,
    activeKey,
    navigationTree = [],
    onMenuItemClick,
    siteId = '',
  } = props;

  const renderNavigation = (navTree: NavigationTree[], cascade = 0) => (
    <>
      {navTree.map((nav) => (
        <Fragment key={nav.key}>
          {nav.type === NAV_ITEM_TYPE_ITEM && (
            <VerticalSingleMenuItem
              nav={nav}
              path={navigationPath(nav, siteId)}
              isActive={nav.key === activeKey}
              showIcon={cascade <= 1}
              onLinkClick={() => onMenuItemClick?.()}
            />
          )}
          {nav.type === NAV_ITEM_TYPE_TITLE && (
            <MenuGroup label={nav.title}>{renderNavigation(nav.subMenu, cascade + 1)}</MenuGroup>
          )}
        </Fragment>
      ))}
    </>
  );

  return (
    <Menu
      aria-label={ariaLabel}
      className="px-4 pb-4"
      defaultActiveKeys={activeKey ? [activeKey] : []}
    >
      {renderNavigation(navigationTree)}
    </Menu>
  );
};

export default VerticalMenuContent;
