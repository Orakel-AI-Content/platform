// Ecme v1.3.10 (e5f9a1d): src/components/ui/Dropdown/DropdownToggle.tsx
// Adaptado (#210), pela acessibilidade:
// - com `title`, o gatilho é um <button type="button">; com `renderTitle`, um
//   <div role="button" tabIndex={0}> (o conteúdo não pode ser interativo). No Ecme era um <div>
//   sem `tabIndex`, que o Tab não alcançava;
// - desabilitado: `aria-disabled` e fora do Tab;
// - ícones `aria-hidden`.
import classNames from '../utils/classNames';
import { TbChevronDown, TbChevronUp, TbChevronRight, TbChevronLeft } from 'react-icons/tb';
import type { CommonProps } from '../@types/common';
import type { Placement } from '@floating-ui/react';
import type { ReactNode, HTMLProps, Ref } from 'react';

export interface DropdownToggleSharedProps {
  renderTitle?: ReactNode;
  placement?: Placement;
  toggleClassName?: string;
  disabled?: boolean;
}

interface DropdownToggleProps extends CommonProps, DropdownToggleSharedProps {
  id?: string;
  ref?: Ref<HTMLElement>;
}

const DropdownToggleDefaultContent = ({
  placement,
  children,
}: {
  placement: Placement;
  children: string | ReactNode;
}) => {
  if (placement && placement.includes('right')) {
    return (
      <>
        {children}
        <TbChevronRight aria-hidden />
      </>
    );
  }

  if (placement && placement.includes('left')) {
    return (
      <>
        <TbChevronLeft aria-hidden />
        {children}
      </>
    );
  }

  if (placement && placement.includes('right')) {
    return (
      <>
        {children}
        <TbChevronUp aria-hidden />
      </>
    );
  }

  return (
    <>
      {children}
      <TbChevronDown aria-hidden />
    </>
  );
};

const DropdownToggle = (
  props: DropdownToggleProps & Omit<HTMLProps<HTMLElement>, 'ref' | 'type'>,
) => {
  const {
    className,
    renderTitle,
    children,
    placement = 'bottom-start',
    disabled,
    ref,
    toggleClassName,
    ...rest
  } = props;

  const toggleClass = 'dropdown-toggle';
  const disabledClass = 'dropdown-toggle-disabled';

  const dropdownToggleClass = classNames(
    toggleClass,
    className,
    toggleClassName,
    disabled && disabledClass,
  );

  const dropdownToggleDefaultClass = classNames(dropdownToggleClass, 'dropdown-toggle-default');

  const disabledProps = disabled ? { 'aria-disabled': true, tabIndex: -1 } : {};

  if (renderTitle) {
    return (
      <div
        role="button"
        tabIndex={0}
        className={dropdownToggleClass}
        {...rest}
        {...disabledProps}
        ref={ref as Ref<HTMLDivElement>}
      >
        {renderTitle}
      </div>
    );
  }

  return (
    <button
      ref={ref as Ref<HTMLButtonElement>}
      type="button"
      className={dropdownToggleDefaultClass}
      {...rest}
      {...disabledProps}
    >
      <span className="flex items-center gap-1">
        <DropdownToggleDefaultContent placement={placement}>
          {children}
        </DropdownToggleDefaultContent>
      </span>
    </button>
  );
};

export default DropdownToggle;
