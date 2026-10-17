// Ecme v1.3.10 (e5f9a1d): src/components/ui/Tooltip/Tooltip.tsx
// Adaptado (#211), pela acessibilidade:
// - o `useFloating` recebe o estado (`tooltipOpen`, que começa em `isOpen`), e não a prop `isOpen`:
//   no Ecme o floating-ui achava a dica sempre fechada, sem `aria-describedby`, sem Esc
//   (`useDismiss`) e sem reposicionar (`autoUpdate`);
// - o `aria-describedby` que o `useRole('tooltip')` gera vai para o filho (o elemento focado),
//   somado ao que ele já tiver; só fica no <span> quando o filho é texto;
// - `safePolygon` no hover: o ponteiro pode ir do gatilho até a dica sem fechá-la (1.4.13);
// - com movimento reduzido, a dica aparece sem transição: ela anima `opacity`, que o
//   `MotionConfig reducedMotion="user"` do layout não para.
'use client';

import { cloneElement, Fragment, isValidElement, useState } from 'react';
import classNames from '../utils/classNames';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import Arrow from './Arrow';
import type { CommonProps } from '../@types/common';
import type { ArrowPlacement } from './Arrow';
import type { ReactElement, ReactNode } from 'react';
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  safePolygon,
  useHover,
  useFocus,
  useDismiss,
  useRole,
  useInteractions,
  FloatingPortal,
} from '@floating-ui/react';

export interface TooltipProps extends CommonProps {
  isOpen?: boolean;
  placement?: ArrowPlacement;
  title: string | ReactNode;
  wrapperClass?: string;
  disabled?: boolean;
}

type Describable = ReactElement<{ 'aria-describedby'?: string }>;

const Tooltip = (props: TooltipProps) => {
  const {
    className,
    children,
    isOpen = false,
    placement = 'top',
    title,
    wrapperClass,
    disabled,
  } = props;

  const [tooltipOpen, setTooltipOpen] = useState<boolean>(isOpen);
  const reduceMotion = useReducedMotion();

  const tooltipColor = {
    background: 'bg-gray-800 dark:bg-black',
    arrow: 'text-gray-800 dark:text-black',
  };

  const defaultTooltipClass = `tooltip ${tooltipColor.background}`;

  const { refs, floatingStyles, context } = useFloating({
    open: tooltipOpen,
    onOpenChange: (open) => {
      if (!disabled) {
        setTooltipOpen(open);
      }
    },
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(7),
      flip({
        fallbackAxisSideDirection: 'start',
      }),
      shift(),
    ],
  });

  // O floating-ui declara `setReference`/`setFloating` como métodos; as arrows evitam o
  // `unbound-method` do lint sem mudar o comportamento.
  const setReference = (node: HTMLElement | null) => refs.setReference(node);
  const setFloating = (node: HTMLElement | null) => refs.setFloating(node);

  const hover = useHover(context, { move: false, handleClose: safePolygon() });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'tooltip' });

  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss, role]);

  const { 'aria-describedby': describedBy, ...referenceProps } = getReferenceProps() as Record<
    string,
    unknown
  > & { 'aria-describedby'?: string };

  // O filho focável recebe a descrição; um fragmento ou texto não tem onde guardá-la.
  const describesChild = isValidElement(children) && children.type !== Fragment;

  const renderChildren = () => {
    if (!describesChild) return children;
    const child = children as Describable;
    const own = child.props['aria-describedby'];
    return cloneElement(child, {
      'aria-describedby': [own, describedBy].filter(Boolean).join(' ') || undefined,
    });
  };

  return (
    <>
      <span
        ref={setReference}
        {...referenceProps}
        {...(describesChild ? {} : { 'aria-describedby': describedBy })}
        className={classNames('tooltip-wrapper', wrapperClass)}
      >
        {renderChildren()}
      </span>
      <FloatingPortal>
        {tooltipOpen && (
          <AnimatePresence>
            <motion.div
              ref={setFloating}
              className={classNames(defaultTooltipClass, className)}
              initial={{
                opacity: 0,
                visibility: 'hidden',
              }}
              animate={
                tooltipOpen
                  ? {
                      opacity: 1,
                      visibility: 'visible',
                    }
                  : {
                      opacity: 0,
                      visibility: 'hidden',
                    }
              }
              transition={reduceMotion ? { duration: 0 } : { duration: 0.15, type: 'tween' }}
              style={floatingStyles}
              {...getFloatingProps()}
            >
              <span>{title}</span>
              <Arrow placement={context.placement} color={tooltipColor.arrow} />
            </motion.div>
          </AnimatePresence>
        )}
      </FloatingPortal>
    </>
  );
};

Tooltip.displayName = 'Tooltip';

export default Tooltip;
