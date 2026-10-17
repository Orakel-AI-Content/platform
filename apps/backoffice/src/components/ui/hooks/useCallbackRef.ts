// Ecme v1.3.10 (e5f9a1d): src/components/ui/hooks/useCallbackRef.ts
'use client';

import { useRef, useEffect, useMemo } from 'react';

function useCallbackRef<T extends (...args: never[]) => unknown>(cb: T | undefined): T {
  const cbRef = useRef(cb);

  useEffect(() => {
    cbRef.current = cb;
  });

  return useMemo(() => ((...args: Parameters<T>) => cbRef.current?.(...args)) as T, []);
}

export default useCallbackRef;
