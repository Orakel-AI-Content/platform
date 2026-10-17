// Ecme v1.3.10 (e5f9a1d): src/components/ui/hooks/useTimeout.ts
'use client';

import { useEffect, useRef, useCallback } from 'react';

export type UseTimeoutReturn = {
  clear: () => void;
  reset: () => void;
};

function useTimeout(fn: (() => void) | undefined, ms = 0, enabled = true): UseTimeoutReturn {
  const timeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const callback = useRef(fn);

  const clear = useCallback(() => {
    if (timeout.current) clearTimeout(timeout.current);
  }, []);

  const set = useCallback(() => {
    if (timeout.current) clearTimeout(timeout.current);
    if (enabled) {
      timeout.current = setTimeout(() => {
        callback.current?.();
      }, ms);
    }
  }, [ms, enabled]);

  useEffect(() => {
    callback.current = fn;
  }, [fn]);

  useEffect(() => {
    set();
    return clear;
  }, [ms, enabled, set, clear]);

  return { clear, reset: set };
}

export default useTimeout;
