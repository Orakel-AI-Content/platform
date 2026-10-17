// Ecme v1.3.10 (e5f9a1d): src/components/ui/Dropdown/DropdownSubItem.tsx
// Adaptado (#210): o <ul> e o <li> de dentro do item que abre submenu ficam `role="none"` (o
// papel de item é do <li> de fora, que o DropdownMenu monta); o chevron fica `aria-hidden`; o
// `isNil` do `es-toolkit/compat` virou `== null`.
'use client';

import { useContext } from 'react';
import useUncertainRef from '../hooks/useUncertainRef';
import useUniqueId from '../hooks/useUniqueId';
import { useConfig } from '../ConfigProvider';
import classNames from '../utils/classNames';
import DropdownContext from './context/dropdownContext';
import MenuItem from '../MenuItem';
import { TbChevronRight, TbChevronLeft } from 'react-icons/tb';
import type { CommonProps } from '../@types/common';
import type { MouseEvent, SyntheticEvent, RefObject, ElementType, Ref } from 'react';

export interface DropdownSubItemSharedProps {
  onClick?: (e: SyntheticEvent) => void;
  onSelect?: (eventKey: string, e: MouseEvent) => void;
  disabled?: boolean;
  eventKey?: string;
}

interface DropdownSubItemProps extends CommonProps, DropdownSubItemSharedProps {
  asElement?: ElementType;
  active?: boolean;
  ref?: Ref<HTMLElement>;
}

const DropdownSubMenu = (props: DropdownSubItemProps) => {
  const {
    asElement: Component = 'li',
    children,
    active: activeProp,
    disabled,
    className,
    style,
    eventKey,
    onSelect,
    ref = null,
    ...rest
  } = props;

  const { direction } = useConfig();

  const dropdown = useContext(DropdownContext);

  const menuitemRef = useUncertainRef<HTMLElement>(ref) as RefObject<HTMLElement | null>;
  const menuitemId = useUniqueId('menu-item-');

  const active = activeProp || (dropdown?.activeKey != null && dropdown?.activeKey === eventKey);

  return (
    <ul role="none" style={style} className="relative" {...rest}>
      <MenuItem
        ref={menuitemRef}
        role="none"
        disabled={disabled}
        asElement={Component}
        id={menuitemId}
        isActive={active}
        eventKey={eventKey}
        className={classNames('dropdown-submenu-item', className)}
        onSelect={onSelect}
      >
        <span>{children}</span>
        {direction === 'rtl' ? <TbChevronLeft aria-hidden /> : <TbChevronRight aria-hidden />}
      </MenuItem>
    </ul>
  );
};

export default DropdownSubMenu;
