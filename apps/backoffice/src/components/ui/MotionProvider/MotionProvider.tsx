'use client';

import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

// Movimento reduzido para todo componente com `motion` (#205): com `reducedMotion="user"`, as
// animações de transform e layout param quando o sistema pede `prefers-reduced-motion`. Não é
// do Ecme (lá cada componente decide); fica num componente client porque o layout raiz é
// Server Component.
export default function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
