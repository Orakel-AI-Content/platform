// Ecme v1.3.10 (e5f9a1d): src/components/ui/CloseButton/CloseButton.tsx
// Adaptado (#209): nome acessível "Fechar" por padrão (`aria-label`, que quem usa pode trocar)
// e o ícone `aria-hidden`; no Ecme o botão só tinha o ícone, sem nome (violação do axe).
import { HiX } from 'react-icons/hi';
import classNames from '../utils/classNames';
import type { CommonProps } from '../@types/common';
import type { MouseEvent, ButtonHTMLAttributes, Ref } from 'react';

export interface CloseButtonProps extends CommonProps, ButtonHTMLAttributes<HTMLButtonElement> {
  absolute?: boolean;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  ref?: Ref<HTMLButtonElement>;
  resetDefaultClass?: boolean;
}

const CloseButton = (props: CloseButtonProps) => {
  const { absolute, className, resetDefaultClass, ref, ...rest } = props;
  const closeButtonAbsoluteClass = 'absolute z-10';

  const closeButtonClass = classNames(
    !resetDefaultClass && 'close-button button-press-feedback',
    absolute && closeButtonAbsoluteClass,
    className,
  );

  return (
    <button ref={ref} className={closeButtonClass} type="button" aria-label="Fechar" {...rest}>
      <HiX aria-hidden />
    </button>
  );
};

export default CloseButton;
