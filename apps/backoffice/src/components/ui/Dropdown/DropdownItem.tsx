// Ecme v1.3.10 (e5f9a1d): src/components/ui/Dropdown/DropdownItem.tsx
// Adaptado (#210), pela acessibilidade:
// - o item se registra no `FloatingList` (`useListItem`), como o DropdownMenu já faz com os
//   submenus, e recebe `tabIndex` pelo `activeIndex`: no Ecme ele não se registrava, e as setas
//   e o typeahead não percorriam os itens;
// - `role="menuitem"` explícito e `aria-disabled` no desabilitado (que as setas pulam);
// - Enter e Espaço escolhem o item focado (no Ecme, só o clique escolhia);
// - divisor com `role="separator"` e cabeçalho com `role="presentation"`;
// - o `isNil` do `es-toolkit/compat` virou `== null`; `submenu` sem `any`.
'use client';

import { useContext, useCallback, isValidElement, cloneElement } from 'react';
import useUncertainRef from '../hooks/useUncertainRef';
import useUniqueId from '../hooks/useUniqueId';
import classNames from '../utils/classNames';
import DropdownContext from './context/dropdownContext';
import MenuContext from './context/menuContext';
import MenuItem from '../MenuItem';
import { DROPDOWN_ITEM_TYPE } from '../utils/constants';
import { useFloatingTree, useListItem, useMergeRefs } from '@floating-ui/react';
import type { CommonProps } from '../@types/common';
import type {
  SyntheticEvent,
  RefObject,
  ElementType,
  ReactElement,
  MouseEvent,
  FocusEvent,
  KeyboardEvent,
  Ref,
} from 'react';

export interface DropdownItemProps extends CommonProps {
  asElement?: ElementType;
  active?: boolean;
  disabled?: boolean;
  submenu?: ReactElement;
  eventKey?: string;
  onSelect?: (eventKey: string, e: SyntheticEvent) => void;
  onFocus?: (e: SyntheticEvent) => void;
  onClick?: (e: SyntheticEvent) => void;
  ref?: Ref<HTMLElement>;
  variant?: 'default' | 'header' | 'divider' | 'custom';
}

const { DEFAULT, DIVIDER, HEADER, CUSTOM } = DROPDOWN_ITEM_TYPE;

const DropdownItem = (props: DropdownItemProps) => {
  const {
    asElement: Component = 'li',
    children,
    active: activeProp,
    disabled,
    className,
    style,
    eventKey,
    onSelect,
    onClick,
    onFocus,
    ref = null,
    variant = DEFAULT,
    ...rest
  } = props;

  const dropdown = useContext(DropdownContext);
  const menu = useContext(MenuContext);

  const menuitemRef = useUncertainRef<HTMLElement>(ref) as RefObject<HTMLElement | null>;

  const menuitemId = useUniqueId('menu-item-');

  const isSeparator = variant === DIVIDER || variant === HEADER;

  // Divisor e cabeçalho não entram na navegação; os outros se registram com o texto, que o
  // typeahead compara.
  const item = useListItem({
    label: !isSeparator && typeof children === 'string' ? children : null,
  });
  const itemRef = useMergeRefs([isSeparator ? null : item.ref, menuitemRef]);

  const active = activeProp || (dropdown?.activeKey != null && dropdown?.activeKey === eventKey);

  const tree = useFloatingTree();

  const activate = useCallback(
    (e: SyntheticEvent) => {
      onSelect?.(eventKey || '', e);
      onClick?.(e);
    },
    [eventKey, onClick, onSelect],
  );

  const handleClick = useCallback(
    (e: SyntheticEvent) => {
      if (disabled) {
        return;
      }

      activate(e);
      tree?.events.emit('click');
    },
    [disabled, activate, tree?.events],
  );

  const menuitemEventHandlers = {
    ...menu.getItemProps({
      onClick(event: MouseEvent<HTMLElement>) {
        handleClick(event);
      },
      onFocus(event: FocusEvent<HTMLElement>) {
        onFocus?.(event);
        menu.setHasFocusInside(true);
      },
      // O <li role="menuitem"> não vira clique com o teclado: Enter e Espaço escolhem o item.
      onKeyDown(event: KeyboardEvent<HTMLElement>) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        handleClick(event);
      },
    }),
  };

  const navigationProps = {
    role: 'menuitem',
    tabIndex: menu.activeIndex === item.index ? 0 : -1,
    'aria-disabled': disabled || undefined,
  };

  if (variant === DIVIDER || variant === HEADER || variant === CUSTOM) {
    return (
      <Component
        ref={itemRef}
        id={menuitemId}
        style={style}
        className={classNames(`menu-item-${variant}`, className)}
        role={variant === DIVIDER ? 'separator' : variant === HEADER ? 'presentation' : undefined}
        {...(variant === CUSTOM ? { ...navigationProps, ...menuitemEventHandlers } : {})}
        {...rest}
      >
        {(variant === HEADER || variant === CUSTOM) && children}
      </Component>
    );
  }

  function renderChildren() {
    if (!isValidElement(children)) {
      return children;
    }
    return cloneElement(children);
  }

  return (
    <MenuItem
      ref={itemRef}
      asElement={Component}
      style={style}
      isActive={active}
      disabled={disabled}
      eventKey={eventKey}
      className={className}
      {...navigationProps}
      {...menuitemEventHandlers}
      {...rest}
    >
      {renderChildren()}
    </MenuItem>
  );
};

export default DropdownItem;
