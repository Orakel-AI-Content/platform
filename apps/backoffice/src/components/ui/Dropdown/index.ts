// Ecme v1.3.10 (e5f9a1d): src/components/ui/Dropdown/index.ts
import type { ForwardRefExoticComponent, RefAttributes } from 'react';
import _Dropdown, { type DropdownProps } from './Dropdown';
import DropdownItem from './DropdownItem';
import DropdownSub from './DropdownSub';
import type { DropdownRef } from './Dropdown';

export type { DropdownProps, DropdownRef } from './Dropdown';
export type { DropdownItemProps } from './DropdownItem';
export type { DropdownSubProps as DropdownMenuProps } from './DropdownSub';

type CompoundedComponent = ForwardRefExoticComponent<DropdownProps & RefAttributes<DropdownRef>> & {
  Item: typeof DropdownItem;
  Menu: typeof DropdownSub;
};

const Dropdown = _Dropdown as CompoundedComponent;

Dropdown.Item = DropdownItem;
Dropdown.Menu = DropdownSub;

export { Dropdown };

export default Dropdown;
