// Ecme v1.3.10 (e5f9a1d): src/components/ui/TimeInput/TimeInputField.tsx
// Adaptado (#316):
// - o separador `:` fica `aria-hidden`: é só desenho, o leitor de tela já anuncia cada campo;
// - `classNames` local (ui/utils) no lugar do pacote `classnames`, e `?.()` no lugar de
//   `typeof fn === "function" && fn()` (lint).
'use client';

import { useRef, useState } from 'react';
import classNames from '../utils/classNames';
import useMergedRef from '../hooks/useMergeRef';
import { padTime } from './utils';
import type { createTimeHandler } from './utils';
import { clamp } from '../utils/clamp';
import type { CommonProps } from '../@types/common';
import type { FocusEvent, Ref, KeyboardEvent, MouseEvent, ChangeEvent } from 'react';

interface TimeInputFieldProps extends CommonProps {
  disabled?: boolean;
  id?: string;
  name?: string;
  max?: number;
  min?: number;
  onChange: ReturnType<typeof createTimeHandler>;
  onFocus?: (event: FocusEvent<HTMLInputElement, Element>) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement, Element>) => void;
  placeholder?: string;
  ref?: Ref<HTMLInputElement>;
  setValue: (value: string) => void;
  withSeparator?: boolean;
  value: string | number | readonly string[];
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

const TimeInputField = (props: TimeInputFieldProps) => {
  const {
    className,
    onFocus,
    onBlur,
    onChange,
    ref = null,
    setValue,
    withSeparator = false,
    max,
    min = 0,
    value,
    ...rest
  } = props;

  const [digitsEntered, setDigitsEntered] = useState(0);

  const inputRef = useRef<HTMLInputElement>(undefined);

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    onFocus?.(event);
    inputRef?.current?.select();
    setDigitsEntered(0);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement, Element>) => {
    onBlur?.(event);
    if (digitsEntered === 1) {
      onChange?.(event.currentTarget.value, false);
    }
  };

  const handleClick = (event: MouseEvent<HTMLInputElement>) => {
    event.stopPropagation();
    inputRef?.current?.select();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const padded = padTime(
        clamp(parseInt(event.currentTarget.value, 10) + 1, min, max as number).toString(),
      );

      if (value !== padded) {
        onChange(padded, false);
      }
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const padded = padTime(
        clamp(parseInt(event.currentTarget.value, 10) - 1, min, max as number).toString(),
      );

      if (value !== padded) {
        onChange(padded, false);
      }
    }
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDigitsEntered(digitsEntered + 1);

    const _val = parseInt(event.currentTarget.value, 10).toString();

    if (_val === '0' && digitsEntered === 0) {
      setValue('00');
      return;
    }
    onChange(_val, true, digitsEntered > 0);
  };

  return (
    <>
      <input
        ref={useMergedRef(inputRef as Ref<HTMLInputElement>, ref)}
        type="text"
        inputMode="numeric"
        value={value}
        className={classNames('time-input-field', className)}
        onChange={handleChange}
        onClick={handleClick}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        {...rest}
      />
      {withSeparator && <span aria-hidden> : </span>}
    </>
  );
};

export default TimeInputField;
