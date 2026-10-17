// Ecme v1.3.10 (e5f9a1d): src/components/ui/hooks/useUncertainRef.ts
'use client';

import { useRef } from 'react';
import type { ForwardedRef } from 'react';

export default function useUncertainRef<T = unknown>(ref: ForwardedRef<T>) {
  const newRef = useRef<T>(null);

  if (ref) {
    return ref;
  }

  return newRef;
}
