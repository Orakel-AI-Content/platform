// Ecme v1.3.10 (e5f9a1d): src/components/ui/Switcher/Switcher.tsx
// Adaptado (#315), pela acessibilidade:
// - o <input type="checkbox"> ganha `role="switch"`: o leitor de tela anuncia "chave" com o
//   estado do próprio `checked`, e o Espaço alterna nativamente; no Ecme o input era `hidden` e
//   não recebia foco (a folha agora o esconde só visualmente e desenha o foco no rótulo);
// - o input é sempre controlado pelo estado do componente: no Ecme, sem `checked`, o input
//   ficava livre e com `readOnly`/`isLoading` o estado nativo divergia do desenhado;
// - `checkedContent`/`unCheckedContent` ficam `aria-hidden` (o estado já vem do `role="switch"`,
//   e o texto não vira o nome do campo); aceita `aria-label`, `aria-labelledby` e
//   `aria-describedby`, para dar o nome.
'use client';

import { useState } from 'react';
import classNames from '../utils/classNames';
import { Spinner } from '../Spinner';
import type { CommonProps } from '../@types/common';
import type { ReactNode, ChangeEvent, InputHTMLAttributes, Ref } from 'react';

export interface SwitcherProps
  extends
    CommonProps,
    Pick<
      InputHTMLAttributes<HTMLInputElement>,
      'aria-label' | 'aria-labelledby' | 'aria-describedby'
    > {
  checked?: boolean;
  checkedContent?: string | ReactNode;
  switcherClass?: string;
  defaultChecked?: boolean;
  disabled?: boolean;
  isLoading?: boolean;
  labelRef?: Ref<HTMLLabelElement>;
  name?: string;
  onChange?: (checked: boolean, e: ChangeEvent<HTMLInputElement>) => void;
  readOnly?: boolean;
  ref?: Ref<HTMLInputElement>;
  unCheckedContent?: string | ReactNode;
}

const Switcher = (props: SwitcherProps) => {
  const {
    checked,
    checkedContent,
    className,
    switcherClass,
    defaultChecked,
    disabled,
    isLoading = false,
    labelRef,
    name,
    onChange,
    readOnly,
    ref,
    unCheckedContent,
    ...rest
  } = props;

  // Prop `checked`, quando definida, prevalece já no primeiro render
  const [switcherChecked, setSwitcherChecked] = useState(
    typeof checked !== 'undefined' ? checked : Boolean(defaultChecked),
  );

  // Sincroniza com a prop durante o render (sem efeito em cascata)
  const [prevChecked, setPrevChecked] = useState(checked);
  if (checked !== prevChecked) {
    setPrevChecked(checked);
    if (typeof checked !== 'undefined') {
      setSwitcherChecked(checked);
    }
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const nextChecked = !switcherChecked;

    if (disabled || readOnly || isLoading) {
      return;
    }

    if (typeof checked === 'undefined') {
      setSwitcherChecked(nextChecked);
    }
    onChange?.(nextChecked, e);
  };

  const switcherColor = switcherClass || 'bg-primary dark:bg-primary';

  return (
    <label
      ref={labelRef}
      className={classNames(
        'switcher',
        switcherChecked && `switcher-checked ${switcherColor}`,
        disabled && 'switcher-disabled',
        className,
      )}
    >
      <input
        ref={ref}
        type="checkbox"
        role="switch"
        disabled={disabled}
        readOnly={readOnly}
        name={name}
        value={`${switcherChecked}`}
        checked={switcherChecked}
        onChange={handleChange}
        {...rest}
      />
      {isLoading ? (
        <Spinner
          className={classNames(
            'switcher-toggle-loading',
            switcherChecked ? 'switcher-checked-loading' : 'switcher-uncheck-loading',
          )}
        />
      ) : (
        <div className="switcher-toggle" />
      )}
      <span className="switcher-content" aria-hidden>
        {switcherChecked ? checkedContent : unCheckedContent}
      </span>
    </label>
  );
};

export default Switcher;
