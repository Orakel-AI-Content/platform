// Ecme v1.3.10 (e5f9a1d): src/components/ui/Input/Input.tsx
// Adaptado (#207):
// - dentro de um FormItem, o campo usa o id que o rótulo aponta (`controlId`, se não vier `id`)
//   e, inválido, anuncia o estado (`aria-invalid`) e soma o id da mensagem de erro ao
//   `aria-describedby` recebido; o Ecme só trocava a classe;
// - (#329) soma também o id da dica do FormItem (`hintId`), sem repetir ids;
// - o `isNil` do `es-toolkit/compat` virou a checagem local de `undefined` (o `offsetWidth` é
//   número ou ausente).
'use client';

import { useState, useEffect, useRef } from 'react';
import classNames from '../utils/classNames';
import { useConfig } from '../ConfigProvider';
import { useForm, useFormItem } from '../Form/context';
import { useInputGroup } from '../InputGroup/context';
import { CONTROL_SIZES } from '../utils/constants';
import type { CommonProps, TypeAttributes } from '../@types/common';
import type {
  InputHTMLAttributes,
  ElementType,
  ReactNode,
  HTMLInputTypeAttribute,
  ClassAttributes,
  Ref,
} from 'react';

export interface InputProps
  extends
    CommonProps,
    Omit<InputHTMLAttributes<HTMLInputElement | HTMLTextAreaElement>, 'size' | 'prefix'> {
  asElement?: ElementType;
  disabled?: boolean;
  invalid?: boolean;
  prefix?: string | ReactNode;
  rows?: number;
  ref?: Ref<ElementType | HTMLInputElement | HTMLTextAreaElement>;
  size?: TypeAttributes.ControlSize;
  suffix?: string | ReactNode;
  textArea?: boolean;
  type?: HTMLInputTypeAttribute;
  unstyle?: boolean;
}

const Input = (props: InputProps) => {
  const {
    asElement: Component = 'input',
    className,
    disabled,
    invalid,
    prefix,
    size,
    suffix,
    textArea,
    type = 'text',
    ref,
    rows,
    style,
    unstyle = false,
    id,
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
    ...rest
  } = props;

  const [prefixGutter, setPrefixGutter] = useState(0);
  const [suffixGutter, setSuffixGutter] = useState(0);

  const { controlSize, direction } = useConfig();
  const formControlSize = useForm()?.size;
  const formItem = useFormItem();
  const inputGroupSize = useInputGroup()?.size;

  const inputSize = size || inputGroupSize || formControlSize || controlSize;

  const isInputInvalid = invalid || formItem?.invalid;

  const describedBy =
    [
      ...new Set(
        [ariaDescribedBy, formItem?.hintId, isInputInvalid ? formItem?.errorId : undefined].filter(
          Boolean,
        ),
      ),
    ].join(' ') || undefined;

  const fixControlledValue = (val: string | number | readonly string[] | undefined) => {
    if (typeof val === 'undefined' || val === null) {
      return '';
    }
    return val;
  };

  if ('value' in props) {
    rest.value = fixControlledValue(props.value);
    delete rest.defaultValue;
  }

  const inputDefaultClass = 'input';
  const inputSizeClass = `input-${inputSize} ${CONTROL_SIZES[inputSize].h}`;
  const inputFocusClass = `focus:ring-primary focus-within:ring-primary focus-within:border-primary focus:border-primary`;
  const inputWrapperClass = classNames('input-wrapper', prefix || suffix ? className : '');
  const inputClass = classNames(
    inputDefaultClass,
    inputSizeClass,
    !isInputInvalid && inputFocusClass,
    !prefix && !suffix ? className : '',
    disabled && 'input-disabled',
    isInputInvalid && 'input-invalid',
    textArea && 'input-textarea',
  );

  const prefixNode = useRef<HTMLDivElement>(null);
  const suffixNode = useRef<HTMLDivElement>(null);

  const getAffixSize = () => {
    if (!prefixNode.current && !suffixNode.current) {
      return;
    }
    const prefixNodeWidth = prefixNode?.current?.offsetWidth;
    const suffixNodeWidth = suffixNode?.current?.offsetWidth;

    if (prefixNodeWidth === undefined && suffixNodeWidth === undefined) {
      return;
    }

    if (prefixNodeWidth) {
      setPrefixGutter(prefixNodeWidth);
    }

    if (suffixNodeWidth) {
      setSuffixGutter(suffixNodeWidth);
    }
  };

  useEffect(() => {
    getAffixSize();
  }, [prefix, suffix]);

  const remToPxConvertion = (pixel: number) => 0.0625 * pixel;

  const affixGutterStyle = () => {
    const leftGutter = `${remToPxConvertion(prefixGutter) + 1}rem`;
    const rightGutter = `${remToPxConvertion(suffixGutter) + 1}rem`;
    const gutterStyle: {
      paddingLeft?: string;
      paddingRight?: string;
    } = {};

    if (direction === 'ltr') {
      if (prefix) {
        gutterStyle.paddingLeft = leftGutter;
      }

      if (suffix) {
        gutterStyle.paddingRight = rightGutter;
      }
    }

    if (direction === 'rtl') {
      if (prefix) {
        gutterStyle.paddingRight = leftGutter;
      }

      if (suffix) {
        gutterStyle.paddingLeft = rightGutter;
      }
    }

    return gutterStyle;
  };

  const inputProps = {
    className: !unstyle ? inputClass : '',
    disabled,
    type,
    ref,
    ...rest,
    id: id ?? formItem?.controlId,
    'aria-invalid': isInputInvalid ? true : ariaInvalid,
    'aria-describedby': describedBy,
  };

  const renderTextArea = (
    <textarea
      style={style}
      rows={rows}
      {...(inputProps as ClassAttributes<HTMLTextAreaElement>)}
    ></textarea>
  );

  const renderInput = <Component style={{ ...affixGutterStyle(), ...style }} {...inputProps} />;

  const renderAffixInput = (
    <span className={inputWrapperClass}>
      {prefix ? (
        <div ref={prefixNode} className="input-suffix-start">
          {' '}
          {prefix}{' '}
        </div>
      ) : null}
      {renderInput}
      {suffix ? (
        <div ref={suffixNode} className="input-suffix-end">
          {suffix}
        </div>
      ) : null}
    </span>
  );

  const renderChildren = () => {
    if (textArea) {
      return renderTextArea;
    }

    if (prefix || suffix) {
      return renderAffixInput;
    } else {
      return renderInput;
    }
  };

  return renderChildren();
};

export default Input;
