// Ecme v1.3.10 (e5f9a1d): src/components/ui/Steps/StepItem.tsx
// Adaptado (#321), pela semântica do LifecycleSteps (#148) e pela acessibilidade:
// - a etapa é um <li> (no Ecme, `div role="presentation"`), dentro do <ol> do Steps; o `ref`
//   passa a ser do <li>;
// - o estado vai em texto `sr-only` ("concluída", "atual", "pendente", "com erro"), além do
//   ícone e da cor; a etapa de índice `current` do Steps leva `aria-current="step"`
//   (`isCurrent`, prop nova que o Steps passa);
// - o ícone e o conector ficam `aria-hidden`; `HiCheck`/`HiX` (`react-icons/hi`) viram
//   `PiCheckBold`/`PiXBold` (`react-icons/pi`);
// - com `onStepChange`, o clique fica num <button type="button"> no `step-item-wrapper` (no Ecme,
//   `onClick` no `div`, fora do teclado): Tab, Enter e Espaço nativos e o foco da regra global;
// - cores pelo contraste (globals-contrast.test.ts): o ✓ da concluída é `dark:text-gray-950` no
//   escuro (no Ecme, `text-white` sobre `primary`, 3,56:1); o hover do título clicável é
//   `dark:hover:text-primary-mild` (no Ecme, `text-primary`, 4,25:1 no cartão); o vermelho
//   padrão do Tailwind (`red-500`), fora da paleta, vira o token `error`.
import classNames from '../utils/classNames';
import { PiCheckBold, PiXBold } from 'react-icons/pi';
import { STEPS_STATUS } from '../utils/constants';
import type { CommonProps, StepStatus } from '../@types/common';
import type { ReactNode, Ref } from 'react';

const { COMPLETE, PENDING, IN_PROGRESS, ERROR } = STEPS_STATUS;

const STEP_STATUS_ICON: Record<string, ReactNode> = {
  [COMPLETE]: <PiCheckBold />,
  [PENDING]: null,
  [IN_PROGRESS]: null,
  [ERROR]: <PiXBold />,
};

/** O estado dito ao leitor de tela (o LifecycleSteps mostra o mesmo texto na tela). */
const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  complete: 'concluída',
  'in-progress': 'atual',
  pending: 'pendente',
  error: 'com erro',
};

export interface StepItemProps extends CommonProps {
  customIcon?: ReactNode | string;
  description?: ReactNode | string;
  isCurrent?: boolean;
  isLast?: boolean;
  onStepChange?: () => void;
  ref?: Ref<HTMLLIElement>;
  status?: StepStatus;
  stepNumber?: number;
  title?: ReactNode | string;
  vertical?: boolean;
}

const StepItem = (props: StepItemProps) => {
  const {
    className,
    customIcon,
    description,
    isCurrent,
    isLast,
    onStepChange,
    ref,
    status,
    stepNumber,
    title,
    vertical,
    ...rest
  } = props;

  let stepIcon = <span>{STEP_STATUS_ICON[status as StepStatus] ?? stepNumber}</span>;

  if (customIcon) {
    stepIcon = <span>{customIcon}</span>;
  }

  const stepItemClass = classNames(
    `step-item step-item-${status}`,
    vertical && 'step-item-vertical',
    className,
  );

  const stepWrapperClass = classNames('step-item-wrapper', onStepChange && 'step-clickable');

  const stepIconClass = classNames(
    `step-item-icon step-item-icon-${status}`,
    status === COMPLETE && `bg-primary text-white dark:text-gray-950`,
    status === ERROR && `step-item-icon-error`,
    status === IN_PROGRESS &&
      `text-primary dark:text-gray-100 border-primary step-item-icon-current`,
  );

  const stepConnectClass = classNames(
    'step-connect',
    title ? 'step-title' : '',
    vertical ? 'step-connect-vertical' : '',
    status === COMPLETE ? `bg-primary` : `inactive`,
  );

  const stepTitleClass = classNames(
    'step-item-title',
    status === ERROR && `step-item-title-error`,
    onStepChange && status !== ERROR && `hover:text-primary dark:hover:text-primary-mild`,
  );

  const content = (
    <>
      <div className={stepIconClass} aria-hidden>
        {stepIcon}
      </div>
      {title && (
        <div className="step-item-content">
          {title && <span className={stepTitleClass}>{title}</span>}
          {description && vertical && <span className="step-item-description">{description}</span>}
        </div>
      )}
      {status && <span className="sr-only">{` (${STEP_STATUS_LABEL[status]})`}</span>}
    </>
  );

  return (
    <li className={stepItemClass} {...rest} ref={ref} aria-current={isCurrent ? 'step' : undefined}>
      {onStepChange ? (
        <button type="button" className={stepWrapperClass} onClick={onStepChange}>
          {content}
        </button>
      ) : (
        <div className={stepWrapperClass}>{content}</div>
      )}
      {!isLast && <div className={stepConnectClass} aria-hidden />}
    </li>
  );
};

export default StepItem;
