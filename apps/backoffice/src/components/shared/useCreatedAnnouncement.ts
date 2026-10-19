'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useEffectEvent } from 'react';

/**
 * Anuncia a confirmação de "criado" ao chegar com a marca na URL (`?criado=1`,
 * `?cadastrado=<id>`) e tira a marca, sem rolar. `message` é `undefined` sem a marca.
 *
 * No quadro seguinte à montagem: texto já presente quando a região `role="status"` aparece
 * não é anunciado; a mudança depois de montar é (#109).
 */
export function useCreatedAnnouncement(
  message: string | undefined,
  announce: (message: string) => void,
): void {
  const router = useRouter();
  const pathname = usePathname();
  const onAnnounce = useEffectEvent(announce);
  useEffect(() => {
    if (message === undefined) return;
    const frame = requestAnimationFrame(() => onAnnounce(message));
    router.replace(pathname, { scroll: false });
    return () => cancelAnimationFrame(frame);
  }, [message, pathname, router]);
}
