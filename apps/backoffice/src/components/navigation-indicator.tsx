'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { navigationTarget } from '@/components/navigation-target.ts';

// Carregamento da navegação (#77): acende no clique de um link interno e apaga quando o
// endereço muda. Um `loading.tsx` não serve aqui: só aparece quando muda o segmento logo
// abaixo dele (as telas ficam todas sob `sites/`) e faria o "não encontrado" responder 200.

export function NavigationIndicator() {
  const current = `${usePathname()}?${useSearchParams().toString()}`;
  const [pending, setPending] = useState(false);
  // Endereço novo (por clique, Voltar ou router.push): a tela chegou. Ajuste durante o
  // render, o padrão do React para reiniciar estado quando um valor muda.
  const [shown, setShown] = useState(current);
  if (shown !== current) {
    setShown(current);
    setPending(false);
  }

  useEffect(() => {
    // Captura: o `Link` do Next cancela o evento antes de ele chegar ao document.
    const onClick = (event: MouseEvent) => {
      if (navigationTarget(event)) setPending(true);
    };
    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);

  // A região existe sempre (vazia em repouso), para o leitor de tela anunciar a mudança.
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 top-2 z-50 flex justify-center"
    >
      {pending && (
        <span className="rounded-md bg-primary px-3 py-1 text-sm font-medium text-neutral dark:text-gray-950">
          Carregando…
        </span>
      )}
    </div>
  );
}
