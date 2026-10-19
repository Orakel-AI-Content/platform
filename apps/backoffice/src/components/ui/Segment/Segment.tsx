// Ecme v1.3.10 (e5f9a1d): src/components/ui/Segment/Segment.tsx
// Adaptado (#315), pela acessibilidade: `role="group"`, com `aria-label`/`aria-labelledby`
// repassados, para o leitor de tela anunciar o conjunto de botões; o Ecme renderizava um <div>
// sem papel. A mesma semântica serve aos dois `selectionType`: cada item é um botão alternável.
'use client';

import { useMemo } from 'react';
import classNames from '../utils/classNames';
import { SegmentContextProvider } from './context';
import useControllableState from '../hooks/useControllableState';
import type { CommonProps, TypeAttributes } from '../@types/common';
import type { SegmentValue } from './context';
import type { HTMLAttributes, Ref } from 'react';

export interface SegmentProps
  extends CommonProps, Pick<HTMLAttributes<HTMLDivElement>, 'aria-label' | 'aria-labelledby'> {
  defaultValue?: SegmentValue;
  onChange?: (segmentValue: SegmentValue) => void;
  ref?: Ref<HTMLDivElement>;
  selectionType?: 'single' | 'multiple';
  size?: TypeAttributes.Size;
  value?: SegmentValue;
}

const Segment = (props: SegmentProps) => {
  const {
    children,
    className,
    defaultValue,
    onChange = () => {
      // empty callback
    },
    ref,
    selectionType = 'single',
    size,
    value: valueProp,
    ...rest
  } = props;

  const [value, setValue] = useControllableState({
    prop: valueProp,
    defaultProp: defaultValue,
    onChange: onChange,
  });

  const onActive = (itemValue: SegmentValue) => {
    setValue(itemValue);
  };

  const onDeactivate = (itemValue: SegmentValue) => {
    if (selectionType === 'single') {
      setValue('');
    }

    if (selectionType === 'multiple') {
      setValue((prevValue = []) => {
        return (prevValue as string[]).filter((value) => value !== itemValue);
      });
    }
  };

  const segmentValue = useMemo(() => {
    if (selectionType === 'single') {
      if (value && typeof value === 'string') {
        return [value];
      }

      if (value && Array.isArray(value)) {
        return value;
      }

      return [];
    }

    if (selectionType === 'multiple') {
      return value ? value : [];
    }
  }, [selectionType, value]);

  return (
    <SegmentContextProvider
      value={{
        value: segmentValue,
        onActive: onActive,
        onDeactivate: onDeactivate,
        selectionType,
        size,
      }}
    >
      <div
        ref={ref}
        role="group"
        className={classNames('segment', 'gap-2 bg-gray-100 dark:bg-gray-700', className)}
        {...rest}
      >
        {children}
      </div>
    </SegmentContextProvider>
  );
};

export default Segment;
