// Ecme v1.3.10 (e5f9a1d): src/components/ui/MenuItem/index.tsx
// Adaptado (#210): `onSelect` com o evento do React (o Ecme tipava com o `MouseEvent` do DOM),
// `role` nas props (o Dropdown usa) e o ícone do `dotIndent` `aria-hidden`.
import classNames from '../utils/classNames';
import { PiDotOutlineFill } from 'react-icons/pi';
import type { CommonProps } from '../@types/common';
import type { ElementType, HTMLAttributes, MouseEvent, Ref } from 'react';

export interface MenuItemProps extends CommonProps, Pick<HTMLAttributes<HTMLElement>, 'role'> {
  asElement?: ElementType;
  id?: string;
  disabled?: boolean;
  dotIndent?: boolean;
  eventKey?: string;
  isActive?: boolean;
  menuItemHeight?: string | number;
  onSelect?: (eventKey: string, e: MouseEvent) => void;
  ref?: Ref<HTMLElement>;
}

const MenuItem = (props: MenuItemProps) => {
  const {
    asElement: Component = 'div',
    children,
    className,
    disabled,
    dotIndent,
    eventKey,
    isActive,
    menuItemHeight = 42,
    onSelect,
    ref,
    style,
    ...rest
  } = props;

  const menuItemActiveClass = `menu-item-active`;
  const menuItemHoverClass = `menu-item-hoverable`;
  const disabledClass = 'menu-item-disabled';
  const menuItemClass = classNames(
    'menu-item',
    isActive && menuItemActiveClass,
    disabled && disabledClass,
    !disabled && menuItemHoverClass,
    dotIndent && 'items-center gap-2',
    className,
  );

  const hanldeOnClick = (e: MouseEvent) => {
    if (onSelect) {
      onSelect(eventKey as string, e);
    }
  };

  return (
    <Component
      ref={ref}
      className={menuItemClass}
      style={{ height: `${menuItemHeight}px`, ...style }}
      onClick={hanldeOnClick}
      {...rest}
    >
      {dotIndent ? (
        <>
          <div>
            <PiDotOutlineFill
              aria-hidden
              className={classNames('text-3xl w-[24px]', !isActive && 'opacity-25')}
            />
          </div>
          {children}
        </>
      ) : (
        <>{children}</>
      )}
    </Component>
  );
};

export default MenuItem;
