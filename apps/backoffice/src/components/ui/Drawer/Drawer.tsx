// Ecme v1.3.10 (e5f9a1d): src/components/ui/Drawer/Drawer.tsx
// Adaptado (#209), pela acessibilidade:
// - `ariaHideApp` volta ao padrão do react-modal (o Ecme o desligava): o contêiner da app,
//   registrado uma vez no layout (ModalAppElement), recebe `aria-hidden` e, por `useInertApp`,
//   `inert` enquanto a gaveta está aberta;
// - o `title` ganha um id e é ligado por `aria-labelledby`;
// - Esc e o clique no fundo chamam `onRequestClose` e, sem ele, o `onClose`;
// - com movimento reduzido, a gaveta entra e sai sem transição: ela anima `left`/`right`/
//   `top`/`bottom`, que o `MotionConfig reducedMotion="user"` do layout não para (só para
//   transform e layout), e o `closeTimeoutMS` vai a 0;
// - sem o `'false'` que o `typeof width === 'number' && 'px'` do Ecme colava em largura e altura
//   em texto (`-50%false`).
'use client';

import Modal from 'react-modal';
import { motion, useReducedMotion, type TargetAndTransition } from 'motion/react';
import classNames from '../utils/classNames';
import CloseButton from '../CloseButton';
import useInertApp from '../hooks/useInertApp';
import useUniqueId from '../hooks/useUniqueId';
import type ReactModal from 'react-modal';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';

export interface DrawerProps extends ReactModal.Props {
  bodyClass?: string;
  closable?: boolean;
  footer?: string | ReactNode;
  footerClass?: string;
  headerClass?: string;
  height?: string | number;
  lockScroll?: boolean;
  onClose?: (e: MouseEvent | KeyboardEvent) => void;
  placement?: 'top' | 'right' | 'bottom' | 'left';
  showBackdrop?: boolean;
  title?: string | ReactNode;
  width?: string | number;
}

const Drawer = (props: DrawerProps) => {
  const {
    aria,
    bodyOpenClassName,
    bodyClass,
    children,
    className,
    closable = true,
    closeTimeoutMS = 300,
    footer,
    footerClass,
    headerClass,
    height = 400,
    isOpen,
    lockScroll = true,
    onClose,
    overlayClassName,
    placement = 'right',
    portalClassName,
    showBackdrop = true,
    title,
    width = 400,
    ...rest
  } = props;

  const reduceMotion = useReducedMotion();
  const titleId = useUniqueId('drawer-title-');

  useInertApp(isOpen);

  // Esc e clique no fundo: o `onRequestClose` de quem usa e, sem ele, o `onClose`.
  const handleRequestClose = (e: MouseEvent | KeyboardEvent) => {
    if (props.onRequestClose) props.onRequestClose(e);
    else onClose?.(e);
  };

  const onCloseClick = (e: MouseEvent<HTMLButtonElement>) => {
    onClose?.(e);
  };

  const renderCloseButton = <CloseButton onClick={onCloseClick} />;

  const unit = (size: string | number) => `${size}${typeof size === 'number' ? 'px' : ''}`;

  const getStyle = (): {
    dimensionClass?: string;
    contentStyle?: {
      width?: string | number;
      height?: string | number;
    };
    motionStyle: {
      [x: string]: string;
    };
  } => {
    if (placement === 'left' || placement === 'right') {
      return {
        dimensionClass: 'vertical',
        contentStyle: { width },
        motionStyle: {
          [placement]: `-${unit(width)}`,
        },
      };
    }

    if (placement === 'top' || placement === 'bottom') {
      return {
        dimensionClass: 'horizontal',
        contentStyle: { height },
        motionStyle: {
          [placement]: `-${unit(height)}`,
        },
      };
    }

    return {
      motionStyle: {},
    };
  };

  const { dimensionClass, contentStyle, motionStyle } = getStyle();

  return (
    <Modal
      className={{
        base: classNames('drawer', className),
        afterOpen: 'drawer-after-open',
        beforeClose: 'drawer-before-close',
      }}
      overlayClassName={{
        base: classNames('drawer-overlay', overlayClassName, !showBackdrop && 'bg-transparent'),
        afterOpen: 'drawer-overlay-after-open',
        beforeClose: 'drawer-overlay-before-close',
      }}
      portalClassName={classNames('drawer-portal', portalClassName)}
      bodyOpenClassName={classNames(
        'drawer-open',
        lockScroll && 'drawer-lock-scroll',
        bodyOpenClassName,
      )}
      isOpen={isOpen}
      closeTimeoutMS={reduceMotion ? 0 : closeTimeoutMS}
      aria={title ? { labelledby: titleId, ...aria } : aria}
      {...rest}
      onRequestClose={handleRequestClose}
    >
      <motion.div
        className={classNames('drawer-content', dimensionClass)}
        style={contentStyle}
        initial={motionStyle}
        animate={
          {
            [placement]: isOpen ? 0 : motionStyle[placement],
          } as TargetAndTransition
        }
        transition={reduceMotion ? { duration: 0 } : undefined}
      >
        {title || closable ? (
          <div className={classNames('drawer-header', headerClass)}>
            {typeof title === 'string' ? (
              <h4 id={titleId}>{title}</h4>
            ) : (
              <span id={titleId}>{title}</span>
            )}
            {closable && renderCloseButton}
          </div>
        ) : null}
        <div className={classNames('drawer-body', bodyClass)}>{children}</div>
        {footer && <div className={classNames('drawer-footer', footerClass)}>{footer}</div>}
      </motion.div>
    </Modal>
  );
};

Drawer.displayName = 'Drawer';

export default Drawer;
