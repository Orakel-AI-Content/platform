// Ecme v1.3.10 (e5f9a1d): src/components/ui/Radio/Group.tsx
// Adaptado (#315), pela acessibilidade:
// - `role="radiogroup"`, com `aria-label`/`aria-labelledby` repassados, para o leitor de tela
//   anunciar o conjunto; o Ecme renderizava um <div> sem papel; aceita também `aria-invalid`,
//   `aria-required` e `aria-describedby` (#331), para o grupo ser um campo de formulário;
// - sem `name`, o grupo gera um (`useId`): é o `name` comum que faz das opções um grupo nativo,
//   com uma parada só no Tab e as setas trocando a escolha;
// - pelos tipos: o valor é `RadioValue` (`string | number`) no lugar de `any`, e o evento de
//   `onChange` é o `ChangeEvent` do <input> (o Ecme o tipava como `MouseEvent`).
'use client';

import { useState, useCallback, useId, useMemo } from 'react';
import classNames from '../utils/classNames';
import { RadioGroupContextProvider } from './context';
import type { CommonProps } from '../@types/common';
import type { RadioValue } from './context';
import type { ChangeEvent, HTMLAttributes, Ref } from 'react';

export interface RadioGroupProps
  extends
    CommonProps,
    Pick<
      HTMLAttributes<HTMLDivElement>,
      'aria-label' | 'aria-labelledby' | 'aria-invalid' | 'aria-required' | 'aria-describedby'
    > {
  radioClass?: string;
  disabled?: boolean;
  name?: string;
  onChange?: (values: RadioValue, e: ChangeEvent<HTMLInputElement>) => void;
  ref?: Ref<HTMLDivElement>;
  value?: RadioValue;
  vertical?: boolean;
}

const Group = (props: RadioGroupProps) => {
  const {
    radioClass,
    disabled,
    name: nameProp,
    onChange,
    ref,
    value: valueProp,
    vertical = false,
    className,
    children,
    ...rest
  } = props;

  const generatedName = useId();
  const name = nameProp ?? generatedName;

  const [value, setValue] = useState(valueProp);

  // Sincroniza com a prop durante o render (sem efeito em cascata)
  const [prevValueProp, setPrevValueProp] = useState(valueProp);
  if (valueProp !== prevValueProp) {
    setPrevValueProp(valueProp);
    if (valueProp !== value) {
      setValue(valueProp);
    }
  }

  const onRadioGroupChange = useCallback(
    (nextValue: RadioValue, e: ChangeEvent<HTMLInputElement>) => {
      setValue(nextValue);
      onChange?.(nextValue, e);
    },
    [onChange, setValue],
  );

  const contextValue = useMemo(
    () => ({
      vertical,
      name,
      value: typeof value === 'undefined' ? null : value,
      radioClass,
      disabled,
      onChange: onRadioGroupChange,
    }),
    [disabled, onRadioGroupChange, vertical, name, radioClass, value],
  );

  const radioGroupClass = classNames('radio-group', vertical && 'vertical', className);

  return (
    <RadioGroupContextProvider value={contextValue}>
      <div ref={ref} role="radiogroup" className={radioGroupClass} {...rest}>
        {children}
      </div>
    </RadioGroupContextProvider>
  );
};

export default Group;
