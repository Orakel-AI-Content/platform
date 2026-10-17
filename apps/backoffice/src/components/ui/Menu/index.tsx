// Ecme v1.3.10 (e5f9a1d): src/components/ui/Menu/index.tsx
// Adaptado (#235): sem o `MenuCollapse` (sem submenus no Backoffice).
import type { ForwardRefExoticComponent, RefAttributes } from 'react';
import MenuBase, { type MenuProps } from './Menu';
import MenuItem from './MenuItem';
import MenuGroup from './MenuGroup';

export type { MenuProps } from './Menu';
export type { MenuGroupProps } from './MenuGroup';
export type { MenuItemProps } from './MenuItem';

type CompoundedComponent = ForwardRefExoticComponent<MenuProps & RefAttributes<HTMLElement>> & {
  MenuItem: typeof MenuItem;
  MenuGroup: typeof MenuGroup;
};

const Menu = MenuBase as CompoundedComponent;

Menu.MenuItem = MenuItem;
Menu.MenuGroup = MenuGroup;

export { Menu };

export default Menu;
