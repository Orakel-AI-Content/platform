// Ecme v1.3.10 (e5f9a1d): src/components/ui/toast/ToastWrapper.tsx
// Adaptado (#212):
// - sem o `ToastWrapper.getInstance`, que montava uma raiz React própria (`react-dom/client`):
//   o ToastProvider, no layout raiz, renderiza um ToastWrapper por placement a partir do store
//   do toast (toast.tsx);
// - região viva: o contêiner é `role="status"`, e a mensagem `type="danger"` vai num item
//   `role="alert"`. O da placement padrão (`top-end`) já nasce montado e vazio, porque uma
//   região viva só é anunciada de forma confiável se existir antes do conteúdo;
// - com movimento reduzido, a entrada e a saída não animam;
// - `block` usa a transição da placement dada (o `castPlacment` do Ecme testava `\top`, um
//   tab, e nunca encontrava a placement);
// - sem `any`.
'use client';

import { cloneElement, useSyncExternalStore } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import classNames from '../utils/classNames';
import chainedFunction from '../utils/chainedFunction';
import { getPlacementTransition } from './transition';
import toast, { getServerToasts, getToasts, subscribeToasts, toastDefaultProps } from './toast';
import type { ToastMessage, ToastProps } from './toast';

interface ToastWrapperProps {
  options: Required<ToastProps>;
  messages: ToastMessage[];
}

const ToastWrapper = ({ options, messages }: ToastWrapperProps) => {
  const reduceMotion = useReducedMotion();
  const { transitionType, placement, offsetX, offsetY, block } = options;

  const placementTransition = getPlacementTransition({
    offsetX,
    offsetY,
    placement,
    transitionType,
  });

  return (
    <div
      role="status"
      data-toast-placement={placement}
      style={placementTransition.default}
      className={classNames('toast', block && 'w-full')}
    >
      {messages.map((item) => (
        <motion.div
          key={item.key}
          role={item.node.props.type === 'danger' ? 'alert' : undefined}
          className="toast-wrapper"
          initial={placementTransition.variants.initial}
          variants={placementTransition.variants}
          animate={item.visible ? 'animate' : 'exit'}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.15, type: 'tween' }}
        >
          {cloneElement(item.node, {
            triggerByToast: true,
            onClose: chainedFunction(item.node.props.onClose, () => toast.remove(item.key)),
            className: classNames(item.node.props.className),
          } as Partial<ToastMessage['node']['props']>)}
        </motion.div>
      ))}
    </div>
  );
};

const wrapperId = ({ placement, block }: Required<ToastProps>) =>
  block ? `${placement}-block` : placement;

/** Mostra os toasts. Montado uma vez no layout raiz, fora do contêiner da app (#209). */
export function ToastProvider() {
  const messages = useSyncExternalStore(subscribeToasts, getToasts, getServerToasts);

  const groups = new Map<string, ToastWrapperProps>([
    [wrapperId(toastDefaultProps), { options: toastDefaultProps, messages: [] }],
  ]);
  for (const message of messages) {
    const id = wrapperId(message.options);
    const group = groups.get(id) ?? { options: message.options, messages: [] };
    group.messages.push(message);
    groups.set(id, group);
  }

  return (
    <>
      {[...groups].map(([id, group]) => (
        <ToastWrapper key={id} {...group} />
      ))}
    </>
  );
}

export default ToastWrapper;
