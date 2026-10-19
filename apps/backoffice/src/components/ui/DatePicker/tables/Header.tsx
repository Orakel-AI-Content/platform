// Ecme v1.3.10 (e5f9a1d): src/components/ui/DatePicker/tables/Header.tsx
// Adaptado (#317), pela acessibilidade: as setas de anterior e próximo têm nome em pt-BR por
// padrão ("Anterior", "Próximo"; cada tabela passa o seu), e o ícone fica `aria-hidden`; no Ecme
// a tabela de dias não passava nome nenhum.
import classNames from '../../utils/classNames';
import { HiChevronRight, HiChevronLeft } from 'react-icons/hi';
import type { CommonProps } from '../../@types/common';

export interface HeaderProps extends CommonProps {
  hasNext: boolean;
  hasPrevious: boolean;
  onNext?: () => void;
  onPrevious?: () => void;
  onNextLevel?: () => void;
  label?: string;
  nextLevelDisabled?: boolean;
  nextLabel?: string;
  previousLabel?: string;
  preventLevelFocus?: boolean;
  preventFocus?: boolean;
}

const Header = (props: HeaderProps) => {
  const {
    hasNext,
    hasPrevious,
    onNext,
    onPrevious,
    onNextLevel,
    label,
    nextLevelDisabled,
    nextLabel = 'Próximo',
    previousLabel = 'Anterior',
    preventLevelFocus = false,
    preventFocus,
    children,
    className,
    ...rest
  } = props;

  const headerLabel = (
    <button
      className="picker-header-label"
      disabled={nextLevelDisabled}
      tabIndex={preventLevelFocus ? -1 : 0}
      type="button"
      onClick={onNextLevel}
      onMouseDown={(event) => preventFocus && event.preventDefault()}
    >
      {label}
    </button>
  );

  const renderChildren = children ? children : headerLabel;

  return (
    <div
      className={classNames(
        'picker-header flex items-center justify-between mb-2 border-b border-gray-200 dark:border-gray-700 pb-2',
        className,
      )}
      {...rest}
    >
      <div className={'flex justify-between w-full items-center rtl:flex-row-reverse'}>
        <button
          type="button"
          className={classNames(
            'picker-direction-button',
            !hasPrevious && 'opacity-0 cursor-default',
          )}
          disabled={!hasPrevious}
          aria-label={previousLabel}
          onClick={onPrevious}
          onMouseDown={(event) => preventFocus && event.preventDefault()}
        >
          <HiChevronLeft aria-hidden />
        </button>
        {renderChildren}
        <button
          type="button"
          className={classNames('picker-direction-button', !hasNext && 'opacity-0 cursor-default')}
          disabled={!hasNext}
          aria-label={nextLabel}
          onClick={onNext}
          onMouseDown={(event) => preventFocus && event.preventDefault()}
        >
          <HiChevronRight aria-hidden />
        </button>
      </div>
    </div>
  );
};

export default Header;
