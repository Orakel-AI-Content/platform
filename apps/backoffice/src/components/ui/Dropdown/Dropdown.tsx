// Ecme v1.3.10 (e5f9a1d): src/components/ui/Dropdown/Dropdown.tsx
'use client';

import { DropdownContextProvider } from './context/dropdownContext';
import DropdownMenu from './DropdownMenu';
import { FloatingTree, useFloatingParentNodeId } from '@floating-ui/react';
import type { DropdownMenuProps, DropdownMenuRef } from './DropdownMenu';
import type { HTMLProps, Ref } from 'react';

export type DropdownRef = DropdownMenuRef;
export interface DropdownProps extends DropdownMenuProps {
  eventKey?: string;
  id?: string;
  ref?: Ref<DropdownRef>;
}

const Dropdown = ({
  activeKey,
  ref,
  ...props
}: DropdownProps & Omit<HTMLProps<HTMLElement>, 'ref' | 'title' | 'onSelect'>) => {
  const parentId = useFloatingParentNodeId();

  if (parentId === null) {
    return (
      <DropdownContextProvider value={{ activeKey }}>
        <FloatingTree>
          <DropdownMenu {...props} ref={ref} />
        </FloatingTree>
      </DropdownContextProvider>
    );
  }

  return <DropdownMenu {...props} ref={ref} />;
};

export default Dropdown;
