// Ecme v1.3.10 (e5f9a1d): src/components/ui/Spinner/Spinner.tsx
// Adaptado (#205): o svg sai com `aria-hidden` por padrão (sem nome acessível, é só indicador);
// quem usa anuncia o carregamento (`aria-busy` no Button, `role="status"` em volta).
import classNames from 'classnames';
import { CgSpinner } from 'react-icons/cg';
import type { CommonProps } from '../@types/common';
import type { ElementType, Ref } from 'react';

export interface SpinnerProps extends CommonProps {
  customColorClass?: string;
  enableTheme?: boolean;
  indicator?: ElementType;
  isSpining?: boolean;
  size?: string | number;
  ref?: Ref<HTMLElement>;
}

const Spinner = (props: SpinnerProps) => {
  const {
    className,
    customColorClass,
    enableTheme = true,
    indicator: Component = CgSpinner,
    isSpining = true,
    size = 20,
    style,
    ref,
    ...rest
  } = props;

  const spinnerColor = customColorClass || (enableTheme && 'text-primary');

  const spinnerStyle = {
    height: size,
    width: size,
    ...style,
  };

  const spinnerClass = classNames(isSpining && 'animate-spin', spinnerColor, className);

  return (
    <Component ref={ref} style={spinnerStyle} className={spinnerClass} aria-hidden {...rest} />
  );
};

export default Spinner;
