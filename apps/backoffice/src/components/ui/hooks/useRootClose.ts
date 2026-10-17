// Ecme v1.3.10 (e5f9a1d): src/components/ui/hooks/useRootClose.ts
'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef } from 'react';
import type { RefObject, ReactEventHandler } from 'react';

type Options = {
  disabled: boolean;
  triggerTarget: RefObject<HTMLElement | null>;
  overlayTarget: RefObject<HTMLElement | null>;
  listenEscape?: boolean;
};

interface CustomEventListener<T = any> {
  (evt: T): void;
}

const domContains = (context: Element, node: (Node & ParentNode) | null) => {
  if (context.contains) {
    return context.contains(node);
  } else if (context.compareDocumentPosition) {
    return context === node || !!(context.compareDocumentPosition(node as Node) & 16);
  }
  if (node) {
    do {
      if (node === context) {
        return true;
      }
    } while ((node = node.parentNode));
  }
  return false;
};

function isLeftClickEvent(e: MouseEvent) {
  return e?.button === 0;
}

function isModifiedEvent(e: MouseEvent) {
  return !!(e.metaKey || e.altKey || e.ctrlKey || e?.shiftKey);
}

function onEventListener<K extends keyof DocumentEventMap>(
  target: Element | Window | Document | EventTarget,
  eventType: K,
  listener: EventListenerOrEventListenerObject | CustomEventListener,
  options: boolean | AddEventListenerOptions = false,
): { off: () => void } {
  target.addEventListener(eventType, listener, options);

  return {
    off() {
      target.removeEventListener(eventType, listener, options);
    },
  };
}

function useRootClose(
  onRootClose: ReactEventHandler | undefined,
  { disabled, triggerTarget, overlayTarget }: Options,
) {
  // A versão mais recente fica no ref abaixo; não precisa de memoização
  // Adaptado (#205): o evento do documento é um MouseEvent nativo (lint do monorepo).
  const handleDocumentMouseDown = (event: MouseEvent) => {
    const triggerElement = triggerTarget.current;
    const overlayElement = overlayTarget.current;

    if (triggerElement && domContains(triggerElement, event.target as (Node & ParentNode) | null)) {
      return;
    }

    if (overlayElement && domContains(overlayElement, event.target as (Node & ParentNode) | null)) {
      return;
    }

    if (isModifiedEvent(event) || !isLeftClickEvent(event)) {
      return;
    }

    onRootClose?.(event as unknown as Parameters<ReactEventHandler>[0]);
  };

  const handleDocumentMouseDownRef = useRef(handleDocumentMouseDown);

  useEffect(() => {
    handleDocumentMouseDownRef.current = handleDocumentMouseDown;
  });

  useEffect(() => {
    const currentTarget = triggerTarget?.current;

    if (disabled || !currentTarget) return;

    const doc = () => (currentTarget && currentTarget.ownerDocument) || document;
    const onDocumentMouseDownListener = onEventListener(
      doc(),
      'mousedown',
      (event: MouseEvent) => handleDocumentMouseDownRef.current(event),
      true,
    );

    return () => {
      onDocumentMouseDownListener?.off();
    };
  }, [triggerTarget, disabled]);
}

export default useRootClose;
