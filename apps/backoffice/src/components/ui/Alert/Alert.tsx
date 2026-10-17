// Ecme v1.3.10 (e5f9a1d): src/components/ui/Alert/Alert.tsx
// Adaptado (#212):
// - título e texto em `text-gray-900 dark:text-gray-100`; o tipo fica no ícone e no fundo
//   `-subtle`. No Ecme o texto vinha na cor do tipo, e `error` e `info` sobre o tingido ficam
//   abaixo de 4,5:1 no claro (pares "texto do alerta" do globals-contrast.test.ts);
// - o botão de fechar perde o `outline-hidden`, que apagava o contorno de 2px do teclado;
// - com movimento reduzido, o fade de saída não roda.
'use client';

import { useState } from 'react';
import classNames from '../utils/classNames';
import useTimeout from '../hooks/useTimeout';
import { HiCheckCircle, HiInformationCircle, HiExclamation, HiXCircle } from 'react-icons/hi';
import { motion, useReducedMotion } from 'motion/react';
import CloseButton from '../CloseButton';
import StatusIcon from '../StatusIcon';
import type { TypeAttributes, CommonProps } from '../@types/common';
import type { ReactNode, MouseEvent, Ref } from 'react';

export interface AlertProps extends CommonProps {
  closable?: boolean;
  customClose?: ReactNode | string;
  customIcon?: ReactNode | string;
  duration?: number;
  title?: ReactNode | string;
  onClose?: (e?: MouseEvent<HTMLDivElement>) => void;
  showIcon?: boolean;
  triggerByToast?: boolean;
  type?: TypeAttributes.Status;
  ref?: Ref<HTMLDivElement>;
}

const DEFAULT_TYPE = 'warning';

const TEXT_COLOR = 'text-gray-900 dark:text-gray-100';

const TYPE_MAP = {
  success: {
    backgroundColor: 'bg-success-subtle',
    titleColor: TEXT_COLOR,
    textColor: TEXT_COLOR,
    iconColor: 'text-success',
    icon: <HiCheckCircle />,
  },
  info: {
    backgroundColor: 'bg-info-subtle',
    titleColor: TEXT_COLOR,
    textColor: TEXT_COLOR,
    iconColor: 'text-info',
    icon: <HiInformationCircle />,
  },
  warning: {
    backgroundColor: 'bg-warning-subtle',
    titleColor: TEXT_COLOR,
    textColor: TEXT_COLOR,
    iconColor: 'text-warning',
    icon: <HiExclamation />,
  },
  danger: {
    backgroundColor: 'bg-error-subtle',
    titleColor: TEXT_COLOR,
    textColor: TEXT_COLOR,
    iconColor: 'text-error',
    icon: <HiXCircle />,
  },
};

const TYPE_ARRAY: TypeAttributes.Status[] = ['success', 'danger', 'info', 'warning'];

const Alert = (props: AlertProps) => {
  const {
    children,
    className,
    closable = false,
    customClose,
    customIcon,
    duration = 3000,
    title = null,
    onClose,
    ref,
    showIcon = false,
    triggerByToast = false,
    ...rest
  } = props;

  const reduceMotion = useReducedMotion();

  const getType = () => {
    const { type = DEFAULT_TYPE } = props;
    if (TYPE_ARRAY.includes(type)) {
      return type;
    }
    return DEFAULT_TYPE;
  };

  const type = getType();
  const typeMap = TYPE_MAP[type];

  const [display, setDisplay] = useState('show');

  const { clear } = useTimeout(onClose, duration, duration > 0);

  const handleClose = (e: MouseEvent<HTMLDivElement>) => {
    setDisplay('hiding');
    onClose?.(e);
    clear();
    if (!triggerByToast) {
      setTimeout(
        () => {
          setDisplay('hide');
        },
        reduceMotion ? 0 : 400,
      );
    }
  };

  const renderClose = () => {
    return (
      <div className="cursor-pointer" role="presentation" onClick={(e) => handleClose(e)}>
        {customClose || <CloseButton resetDefaultClass className="text-lg" />}
      </div>
    );
  };

  const alertClass = classNames(
    'alert',
    typeMap.backgroundColor,
    typeMap.textColor,
    !title ? 'font-semibold' : '',
    closable ? 'justify-between' : '',
    closable && !title ? 'items-center' : '',
    !triggerByToast && 'rounded-xl',

    className,
  );

  if (display === 'hide') {
    return null;
  }

  return (
    <motion.div
      ref={ref}
      className={alertClass}
      initial={{ opacity: 1 }}
      animate={display === 'hiding' ? 'exit' : 'animate'}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.25, type: 'tween' }}
      variants={{
        animate: {
          opacity: 1,
        },
        exit: {
          opacity: 0,
        },
      }}
      {...rest}
    >
      <div
        className={classNames(
          'flex gap-2',
          !title && children ? 'items-center' : '',
          title && children ? 'mt-0.5' : '',
        )}
      >
        {showIcon && <StatusIcon iconColor={typeMap.iconColor} custom={customIcon} type={type} />}
        <div>
          {title ? (
            <div className={classNames('font-semibold text-lg mb-1', typeMap.titleColor)}>
              {title}
            </div>
          ) : null}
          {children}
        </div>
      </div>
      {closable ? renderClose() : null}
    </motion.div>
  );
};

export default Alert;
