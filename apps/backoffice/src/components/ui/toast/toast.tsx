// Ecme v1.3.10 (e5f9a1d): src/components/ui/toast/toast.tsx
// Adaptado (#212): o toast é um store do módulo. O Ecme criava, no primeiro `push`, uma raiz
// React própria em `document.body` (`react-dom/client`, no ToastWrapper.getInstance):
// um segundo React fora da página, sem o contexto, o tema nem o `MotionConfig` do layout. Aqui o
// `push` só enfileira a mensagem, e o ToastProvider, montado uma vez no layout raiz, a mostra
// (`useSyncExternalStore`). A API para quem usa é a mesma (`toast.push`, `toast.remove`,
// `toast.removeAll`); uma mensagem enviada antes de o provedor montar aparece quando ele monta.
// A `key` vem de um contador, e não de `Math.random`.
import { PLACEMENT } from '../utils/constants';
import type { NotificationPlacement } from '../@types/placement';
import type { ReactElement } from 'react';

export interface ToastProps {
  transitionType?: 'scale' | 'fade';
  placement?: NotificationPlacement;
  offsetX?: string | number;
  offsetY?: string | number;
  block?: boolean;
}

export const toastDefaultProps: Required<ToastProps> = {
  placement: PLACEMENT.TOP_END as NotificationPlacement,
  offsetX: 30,
  offsetY: 30,
  transitionType: 'scale',
  block: false,
};

export type ToastMessage = {
  key: string;
  visible: boolean;
  node: ReactElement<{ onClose?: () => void; type?: string; className?: string }>;
  options: Required<ToastProps>;
};

export interface Toast {
  (message: ToastMessage['node'], options?: ToastProps): string;
  push(message: ToastMessage['node'], options?: ToastProps): string;
  remove(key: string): void;
  removeAll(): void;
}

/** Tempo para a saída antes de a mensagem sair do DOM, como no Ecme. */
const EXIT_DELAY = 50;

const EMPTY: ToastMessage[] = [];

let messages: ToastMessage[] = EMPTY;
let counter = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function setMessages(next: ToastMessage[]) {
  messages = next;
  emit();
}

export function subscribeToasts(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getToasts() {
  return messages;
}

/** No servidor não há toast: a fila só recebe mensagens de handlers do navegador. */
export function getServerToasts() {
  return EMPTY;
}

const toast = ((message, options) => toast.push(message, options)) as Toast;

toast.push = (message, options) => {
  counter += 1;
  const key = `toast-${counter}`;
  setMessages([
    ...messages,
    { key, visible: true, node: message, options: { ...toastDefaultProps, ...options } },
  ]);
  return key;
};

toast.remove = (key) => {
  if (!messages.some((message) => message.key === key)) return;
  setMessages(
    messages.map((message) => (message.key === key ? { ...message, visible: false } : message)),
  );
  setTimeout(() => {
    setMessages(messages.filter((message) => message.key !== key));
  }, EXIT_DELAY);
};

toast.removeAll = () => {
  if (messages.length === 0) return;
  setMessages(messages.map((message) => ({ ...message, visible: false })));
  setTimeout(() => {
    setMessages(EMPTY);
  }, EXIT_DELAY);
};

export default toast;
