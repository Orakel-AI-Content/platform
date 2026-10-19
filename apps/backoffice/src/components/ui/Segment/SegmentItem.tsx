// Ecme v1.3.10 (e5f9a1d): src/components/ui/Segment/SegmentItem.tsx
// Adaptado (#315), pela acessibilidade:
// - `type="button"`, para o item não enviar o formulário em que estiver (como no #304);
// - `aria-pressed` reflete `active`: o leitor de tela anuncia o botão como pressionado;
// - `disabled` também no atributo nativo: o Ecme só ignorava o clique e trocava a classe, e o
//   botão seguia no Tab sem ser anunciado como indisponível.
// Com `children` como função, o elemento é de quem usa, e esses atributos também.
'use client';

import { useCallback } from 'react';
import classNames from '../utils/classNames';
import { useSegment } from './context';
import { SEGMENT_SIZES, SIZES } from '../utils/constants';
import type { CommonProps, TypeAttributes } from '../@types/common';
import type { SegmentValue } from './context';
import type { ReactNode, ComponentPropsWithRef } from 'react';

type ChildrenParams = {
  active: boolean;
  disabled: boolean;
  value: string;
  onSegmentItemClick: () => void;
};

export interface SegmentItemProps
  extends Omit<CommonProps, 'children'>, Omit<ComponentPropsWithRef<'button'>, 'children'> {
  children: ChildrenFunction | ReactNode;
  disabled?: boolean;
  size?: TypeAttributes.Size;
  value?: string;
}

type ChildrenFunction = (params: ChildrenParams) => ReactNode;

const unwrapArray = (arg: ChildrenFunction): ChildrenFunction =>
  Array.isArray(arg) ? (arg[0] as ChildrenFunction) : arg;

const SegmentItem = (props: SegmentItemProps) => {
  const { children, className, disabled = false, ref, value: valueProp, size, ...rest } = props;

  const {
    value: valueContext,
    onActive,
    onDeactivate,
    selectionType,
    size: segmentSize,
  } = useSegment();

  const active = (valueContext as string[]).includes(valueProp as string);

  const buttonSize = size || segmentSize;

  const getSegmentSize = useCallback(() => {
    let sizeClass: string;
    switch (buttonSize) {
      case SIZES.LG:
        sizeClass = classNames(SEGMENT_SIZES.lg.h, 'md:px-8 py-2 px-4 text-base');
        break;
      case SIZES.SM:
        sizeClass = classNames(SEGMENT_SIZES.sm.h, 'px-3 py-2 text-sm');
        break;
      case SIZES.XS:
        sizeClass = classNames(SEGMENT_SIZES.xs.h, 'px-3 py-1 text-xs');
        break;
      default:
        sizeClass = classNames(SEGMENT_SIZES.md.h, 'px-5 py-2');
        break;
    }
    return sizeClass;
  }, [buttonSize]);

  const onSegmentItemClick = () => {
    if (!disabled) {
      if (!active) {
        if (selectionType === 'single') {
          onActive?.(valueProp as string);
        }
        if (selectionType === 'multiple') {
          const nextValue = [...(valueContext as string[]), ...[valueProp]] as string[];
          onActive?.(nextValue);
        }
      } else if (selectionType === 'multiple') {
        onDeactivate?.(valueProp as SegmentValue);
      }
    }
  };

  return typeof children === 'function' ? (
    unwrapArray(children)({
      active,
      onSegmentItemClick,
      disabled,
      value: valueProp as string,
      ...rest,
    })
  ) : (
    <button
      ref={ref}
      type="button"
      aria-pressed={active}
      disabled={disabled}
      className={classNames(
        'segment-item',
        getSegmentSize(),
        active && 'segment-item-active',
        disabled && 'segment-item-disabled',
        className,
      )}
      onClick={onSegmentItemClick}
      {...rest}
    >
      {children}
    </button>
  );
};

export default SegmentItem;
