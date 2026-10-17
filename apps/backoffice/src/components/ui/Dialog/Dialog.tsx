// Ecme v1.3.10 (e5f9a1d): src/components/ui/Dialog/Dialog.tsx
// Adaptado (#209), pela acessibilidade:
// - `ariaHideApp` volta ao padrão do react-modal (o Ecme o desligava): o contêiner da app,
//   registrado uma vez no layout (ModalAppElement), recebe `aria-hidden` e, por `useInertApp`,
//   `inert` enquanto o diálogo está aberto;
// - `title` opcional: vira o título do diálogo e é ligado por `aria-labelledby`; sem ele, quem
//   usa passa `aria` ou `contentLabel` do react-modal;
// - Esc e o clique no fundo chamam `onRequestClose` e, sem ele, o `onClose` (no Ecme, o Esc só
//   fechava se quem usa passasse os dois);
// - com movimento reduzido, nem a escala nem o atraso de fechamento (`closeTimeoutMS`) rodam.
'use client';

import Modal from 'react-modal';
import { motion, useReducedMotion } from 'motion/react';
import classNames from '../utils/classNames';
import CloseButton from '../CloseButton';
import useInertApp from '../hooks/useInertApp';
import useUniqueId from '../hooks/useUniqueId';
import useWindowSize from '../hooks/useWindowSize';
import type ReactModal from 'react-modal';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';

export interface DialogProps extends ReactModal.Props {
  closable?: boolean;
  contentClassName?: string;
  height?: string | number;
  onClose?: (e: MouseEvent | KeyboardEvent) => void;
  title?: ReactNode;
  width?: number;
}

const Dialog = (props: DialogProps) => {
  const currentSize = useWindowSize();
  const reduceMotion = useReducedMotion();
  const titleId = useUniqueId('dialog-title-');

  const {
    aria,
    bodyOpenClassName,
    children,
    className,
    closable = true,
    closeTimeoutMS = 150,
    contentClassName,
    height,
    isOpen,
    onClose,
    overlayClassName,
    portalClassName,
    style,
    title,
    width = 520,
    ...rest
  } = props;

  useInertApp(isOpen);

  // Esc e clique no fundo: o `onRequestClose` de quem usa e, sem ele, o `onClose`.
  const handleRequestClose = (e: MouseEvent | KeyboardEvent) => {
    if (props.onRequestClose) props.onRequestClose(e);
    else onClose?.(e);
  };

  const onCloseClick = (e: MouseEvent<HTMLButtonElement>) => {
    onClose?.(e);
  };

  const renderCloseButton = (
    <CloseButton absolute className="ltr:right-6 rtl:left-6 top-4.5" onClick={onCloseClick} />
  );

  const contentStyle = {
    content: {
      inset: 'unset',
    } as NonNullable<ReactModal.Styles['content']>,
    ...style,
  };

  if (width !== undefined) {
    contentStyle.content.width = width;

    if (typeof currentSize.width !== 'undefined' && currentSize.width <= width) {
      contentStyle.content.width = 'auto';
    }
  }

  if (height !== undefined) {
    contentStyle.content.height = height;
  }

  const defaultDialogContentClass = 'dialog-content';

  const dialogClass = classNames(defaultDialogContentClass, contentClassName);

  return (
    <Modal
      className={{
        base: classNames('dialog', className),
        afterOpen: 'dialog-after-open',
        beforeClose: 'dialog-before-close',
      }}
      overlayClassName={{
        base: classNames('dialog-overlay', overlayClassName),
        afterOpen: 'dialog-overlay-after-open',
        beforeClose: 'dialog-overlay-before-close',
      }}
      portalClassName={classNames('dialog-portal', portalClassName)}
      bodyOpenClassName={classNames('dialog-open', bodyOpenClassName)}
      isOpen={isOpen}
      style={{ ...contentStyle }}
      closeTimeoutMS={reduceMotion ? 0 : closeTimeoutMS}
      aria={title ? { labelledby: titleId, ...aria } : aria}
      {...rest}
      onRequestClose={handleRequestClose}
    >
      <motion.div
        className={dialogClass}
        initial={{ transform: 'scale(0.9)' }}
        animate={{
          transform: isOpen ? 'scale(1)' : 'scale(0.9)',
        }}
        transition={reduceMotion ? { duration: 0 } : undefined}
      >
        {closable && renderCloseButton}
        {title ? (
          <h5 id={titleId} className="mb-4">
            {title}
          </h5>
        ) : null}
        {children}
      </motion.div>
    </Modal>
  );
};

Dialog.displayName = 'Dialog';

export default Dialog;
