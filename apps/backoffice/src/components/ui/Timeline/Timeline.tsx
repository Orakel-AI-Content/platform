// Ecme v1.3.10 (e5f9a1d): src/components/ui/Timeline/Timeline.tsx
// Adaptado (#646): `classNames` e `mapCloneElement` de `ui/utils`, tipado pelas props do item
// (sem o `any`); o último item é o último filho válido (no Ecme, `Children.count`, que conta
// também `null` e `false` de um item condicional e deixa o último sem `isLast`).
import classNames from '../utils/classNames';
import { Children, isValidElement } from 'react';
import mapCloneElement from '../utils/mapCloneElement';
import type { CommonProps } from '../@types/common';
import type { TimeLineItemProps } from './TimeLineItem';
import type { Ref } from 'react';

export type TimelineProps = CommonProps & {
  ref?: Ref<HTMLUListElement>;
};

const Timeline = (props: TimelineProps) => {
  const { children, className, ref } = props;

  const count = Children.toArray(children).filter((child) => isValidElement(child)).length;

  const items = mapCloneElement<TimeLineItemProps>(children, (item, index) => ({
    isLast: index === count - 1,
    ...item.props,
  }));

  return (
    <ul ref={ref} className={classNames('timeline', className)}>
      {items}
    </ul>
  );
};

export default Timeline;
