// Ecme v1.3.10 (e5f9a1d): src/components/ui/Menu/Menu.tsx
// Adaptado (#235): o <nav> aceita `aria-label` e `aria-labelledby`, para os landmarks
// "Principal" e "Áreas do site" (docs/migration/ecme.md); `onSelect` com o evento do React.
'use client';

import classNames from '../utils/classNames';
import { MenuContextProvider } from './context/menuContext';
import type { CommonProps } from '../@types/common';
import type { HTMLAttributes, MouseEvent, Ref } from 'react';

export interface MenuProps
  extends CommonProps, Pick<HTMLAttributes<HTMLElement>, 'aria-label' | 'aria-labelledby'> {
  defaultActiveKeys?: Array<string>;
  defaultExpandedKeys?: Array<string>;
  defaultCollapseActiveKeys?: Array<string>;
  menuItemHeight?: number;
  onSelect?: (eventKey: string, e: MouseEvent) => void;
  ref?: Ref<HTMLElement>;
  sideCollapsed?: boolean;
}

const Menu = (props: MenuProps) => {
  const {
    children,
    className,
    defaultActiveKeys = [],
    defaultExpandedKeys = [],
    defaultCollapseActiveKeys = [],
    menuItemHeight = 48,
    onSelect,
    ref,
    sideCollapsed = false,
    ...rest
  } = props;

  const menuDefaultClass = 'menu';

  const menuClass = classNames(menuDefaultClass, className);

  return (
    <nav ref={ref} className={menuClass} {...rest}>
      <MenuContextProvider
        value={{
          onSelect,
          menuItemHeight,
          sideCollapsed,
          defaultExpandedKeys,
          defaultActiveKeys,
          defaultCollapseActiveKeys,
        }}
      >
        {children}
      </MenuContextProvider>
    </nav>
  );
};

export default Menu;
