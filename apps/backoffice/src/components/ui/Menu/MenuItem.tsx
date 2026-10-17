// Ecme v1.3.10 (e5f9a1d): src/components/ui/Menu/MenuItem.tsx
// Adaptado (#235): sem o consumidor do `collapseContext` (o MenuCollapse não entra: a
// navegação do Backoffice não tem submenus), e os contextos lidos com `useContext` no lugar
// dos Consumers aninhados; dentro de um MenuGroup, o item é <li> por padrão.
'use client';

import { useContext } from 'react';
import MenuContext from './context/menuContext';
import GroupContext from './context/groupContext';
import BaseMenuItem from '../MenuItem';
import type { MenuItemProps as BaseMenuItemProps } from '../MenuItem';

export type MenuItemProps = BaseMenuItemProps;

const MenuItem = (props: MenuItemProps) => {
  const { eventKey, ...rest } = props;

  const context = useContext(MenuContext);
  const inGroup = useContext(GroupContext);

  return (
    <BaseMenuItem
      asElement={inGroup ? 'li' : undefined}
      menuItemHeight={context.menuItemHeight}
      isActive={(context.defaultActiveKeys as string[]).includes(eventKey as string)}
      eventKey={eventKey}
      onSelect={context.onSelect}
      {...rest}
    />
  );
};

MenuItem.displayName = 'MenuItem';

export default MenuItem;
