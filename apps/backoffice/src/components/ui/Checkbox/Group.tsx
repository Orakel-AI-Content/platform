// Ecme v1.3.10 (e5f9a1d): src/components/ui/Checkbox/Group.tsx
// Adaptado (#208):
// - `role="group"`, com `aria-label`/`aria-labelledby` repassados, para o leitor de tela anunciar
//   o conjunto; o Ecme renderizava um <div> sem papel;
// - o `cloneDeep`/`remove` do `es-toolkit/compat` viraram cópia do array e filtro com
//   `shallowEqual` (os valores são primitivos).
'use client';

import { useState, useCallback, useMemo } from 'react';
import classNames from '../utils/classNames';
import { CheckboxGroupContextProvider } from './context';
import shallowEqual from '../utils/shallowEqual';
import type { CommonProps } from '../@types/common';
import type { CheckboxGroupValue, CheckboxValue } from './context';
import type { HTMLAttributes, SyntheticEvent, Ref } from 'react';

export interface CheckboxGroupProps
  extends CommonProps, Pick<HTMLAttributes<HTMLDivElement>, 'aria-label' | 'aria-labelledby'> {
  checkboxClass?: string;
  name?: string;
  onChange?: (value: CheckboxGroupValue, event: SyntheticEvent) => void;
  ref?: Ref<HTMLDivElement>;
  value?: CheckboxGroupValue;
  vertical?: boolean;
}

const Group = (props: CheckboxGroupProps) => {
  const {
    children,
    className,
    checkboxClass,
    name,
    onChange,
    ref,
    value: valueProp,
    vertical,
    ...rest
  } = props;

  const [value, setValue] = useState(valueProp);

  // Sincroniza com a prop durante o render (sem efeito em cascata)
  const [prevValueProp, setPrevValueProp] = useState(valueProp);
  if (valueProp !== prevValueProp) {
    setPrevValueProp(valueProp);
    setValue(valueProp);
  }

  const onCheckboxGroupChange = useCallback(
    (itemValue: CheckboxValue, itemChecked: boolean, event: SyntheticEvent) => {
      const current = value ? [...value] : [];
      const nextValue = itemChecked
        ? [...current, itemValue as never]
        : current.filter((i) => !shallowEqual(i, itemValue));

      setValue(nextValue);
      onChange?.(nextValue, event);
    },
    [onChange, setValue, value],
  );

  const contextValue = useMemo(
    () => ({
      vertical,
      name,
      value,
      checkboxClass,
      onChange: onCheckboxGroupChange,
    }),
    [vertical, onCheckboxGroupChange, name, checkboxClass, value],
  );

  return (
    <CheckboxGroupContextProvider value={contextValue}>
      <div
        ref={ref}
        role="group"
        className={classNames('inline-flex gap-4', vertical ? 'flex-col' : '', className)}
        {...rest}
      >
        {children}
      </div>
    </CheckboxGroupContextProvider>
  );
};

export default Group;
