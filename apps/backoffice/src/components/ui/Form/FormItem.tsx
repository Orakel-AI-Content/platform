// Ecme v1.3.10 (e5f9a1d): src/components/ui/Form/FormItem.tsx
// Adaptado (#207), pela acessibilidade:
// - o rótulo e a mensagem ficam ligados ao campo pelo contexto: sem `htmlFor`, o FormItem gera
//   o id do campo (`controlId`), e a mensagem de erro ganha um id (`errorId`) que o Input soma
//   ao `aria-describedby` enquanto o item está inválido; no Ecme só o `htmlFor` manual ligava
//   o rótulo, e a mensagem não era ligada;
// - a mensagem entra e sai sem transição com movimento reduzido: ela anima `opacity` e
//   margens, que o `MotionConfig reducedMotion="user"` do layout não para (ele só para
//   transform e layout);
// - o asterisco usa `text-error` (o Ecme usava `text-red-500`, fora do `@theme`) e fica oculto
//   do leitor de tela, que já anuncia o `required` do campo.
'use client';

import classNames from '../utils/classNames';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useForm, FormItemContextProvider } from './context';
import { useConfig } from '../ConfigProvider';
import useUniqueId from '../hooks/useUniqueId';
import { CONTROL_SIZES, LAYOUT } from '../utils/constants';
import type { CommonProps, TypeAttributes } from '../@types/common';
import type { ReactNode, Ref } from 'react';

export interface FormItemProps extends CommonProps {
  asterisk?: boolean;
  errorMessage?: string;
  extra?: string | ReactNode;
  htmlFor?: string;
  invalid?: boolean;
  label?: string;
  labelClass?: string;
  labelWidth?: string | number;
  layout?: TypeAttributes.FormLayout;
  ref?: Ref<HTMLDivElement>;
  size?: TypeAttributes.ControlSize;
}

const FormItem = (props: FormItemProps) => {
  const {
    asterisk,
    children,
    className,
    errorMessage,
    extra,
    htmlFor,
    invalid,
    label,
    labelClass,
    labelWidth,
    layout,
    ref,
    style,
    size,
  } = props;

  const formContext = useForm();
  const { controlSize } = useConfig();
  const generatedId = useUniqueId('form-item-');
  const reduceMotion = useReducedMotion();

  const controlId = htmlFor ?? `${generatedId}-control`;
  const errorId = `${generatedId}-error`;
  const describedByError = Boolean(invalid && errorMessage);

  const formItemLabelHeight = size || formContext?.size || controlSize;
  const formItemLabelWidth = labelWidth || formContext?.labelWidth;
  const formItemLayout = layout || formContext?.layout || 'vertical';

  const getFormLabelLayoutClass = () => {
    switch (formItemLayout) {
      case LAYOUT.HORIZONTAL:
        return label
          ? `${CONTROL_SIZES[formItemLabelHeight].h} ${label && 'ltr:pr-2 rtl:pl-2'}`
          : 'ltr:pr-2 rtl:pl-2';
      case LAYOUT.VERTICAL:
        return `mb-2`;
      case LAYOUT.INLINE:
        return `${CONTROL_SIZES[formItemLabelHeight].h} ${label && 'ltr:pr-2 rtl:pl-2'}`;
      default:
        return '';
    }
  };

  const formItemClass = classNames(
    'form-item',
    formItemLayout,
    className,
    invalid ? 'invalid' : '',
  );

  const formLabelClass = classNames('form-label', label && getFormLabelLayoutClass(), labelClass);

  const formLabelStyle = () => {
    if (formItemLayout === LAYOUT.HORIZONTAL) {
      return { ...style, ...{ minWidth: formItemLabelWidth } };
    }

    return { ...style };
  };

  const enterStyle = { opacity: 1, marginTop: 3, bottom: -21 };
  const exitStyle = { opacity: 0, marginTop: -10 };
  const initialStyle = exitStyle;

  return (
    <FormItemContextProvider
      value={{ invalid, controlId, errorId: describedByError ? errorId : undefined }}
    >
      <div ref={ref} className={formItemClass}>
        <label htmlFor={controlId} className={formLabelClass} style={formLabelStyle()}>
          {asterisk && (
            <span aria-hidden className="text-error ltr:mr-1 rtl:ml-1">
              *
            </span>
          )}
          {label}
          {extra && <span>{extra}</span>}
          {label && formItemLayout !== 'vertical' && ':'}
        </label>
        <div
          className={
            formItemLayout === LAYOUT.HORIZONTAL
              ? 'w-full flex flex-col justify-center relative'
              : ''
          }
        >
          {children}
          <AnimatePresence mode="wait">
            {invalid && (
              <motion.div
                id={errorId}
                className="form-explain"
                initial={initialStyle}
                animate={enterStyle}
                exit={exitStyle}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.15, type: 'tween' }}
              >
                {errorMessage}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </FormItemContextProvider>
  );
};

export default FormItem;
