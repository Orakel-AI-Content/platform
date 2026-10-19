// Ecme v1.3.10 (e5f9a1d): src/components/ui/Steps/Steps.tsx
// Adaptado (#321): a lista é um <ol> (no Ecme, `div`), e o `ref` passa a ser dele; a etapa de
// índice `current` recebe `isCurrent`, que a marca com `aria-current="step"` (StepItem.tsx);
// `classNames` e `mapCloneElement` de `ui/utils`.
import classNames from '../utils/classNames';
import { Children } from 'react';
import { STEPS_STATUS } from '../utils/constants';
import mapCloneElement from '../utils/mapCloneElement';
import type { CommonProps, StepStatus } from '../@types/common';
import type { StepItemProps } from './StepItem';
import type { Ref } from 'react';

const { COMPLETE, PENDING, IN_PROGRESS, ERROR } = STEPS_STATUS;

export interface StepsProps extends CommonProps {
  current?: number;
  onChange?: (index: number) => void;
  ref?: Ref<HTMLOListElement>;
  status?: StepStatus;
  vertical?: boolean;
}

const Steps = (props: StepsProps) => {
  const {
    className,
    children,
    vertical = false,
    current = 0,
    status = IN_PROGRESS as StepStatus,
    onChange,
    ref,
    ...rest
  } = props;

  const count = Children.count(children);

  const items = mapCloneElement<StepItemProps>(children, (item, index) => {
    const itemStyles = {
      flexBasis: index < count - 1 ? `${100 / (count - 1)}%` : undefined,
      maxWidth: index === count - 1 ? `${100 / count}%` : undefined,
    };
    const itemProps: StepItemProps = {
      stepNumber: index + 1,
      status: PENDING as StepStatus,
      style: !vertical ? itemStyles : undefined,
      isCurrent: index === current,
      isLast: index === count - 1,
      vertical: vertical,
      onStepChange: onChange ? () => onChange(index) : undefined,
      ...item.props,
    };

    if (status === ERROR && index === current - 1) {
      itemProps.className = classNames('steps-item-error');
    }

    if (!item.props.status) {
      if (index === current) {
        itemProps.status = status;
        itemProps.className = classNames(itemProps.className, 'steps-item-active');
      } else if (index < current) {
        itemProps.status = COMPLETE as StepStatus;
      }
    }
    return itemProps;
  });

  return (
    <ol
      ref={ref}
      className={classNames('steps', vertical && 'steps-vertical', className)}
      {...rest}
    >
      {items}
    </ol>
  );
};

export default Steps;
