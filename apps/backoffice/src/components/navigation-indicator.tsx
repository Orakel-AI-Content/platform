'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

// Carregamento da navegação (#77): acende no clique de um link interno e apaga quando o
// endereço muda. Um `loading.tsx` não serve aqui: só aparece quando muda o segmento logo
// abaixo dele (as telas ficam todas sob `sites/`) e faria o "não encontrado" responder 200.

/** O clique abre outra tela nesta aba? (Não: nova aba, modificador, download, externo.) */
function navigationTarget(event: MouseEvent): URL | undefined {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return undefined;
  }
  const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!(anchor instanceof HTMLAnchorElement)) return undefined;
  if (anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) {
    return undefined;
  }
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return undefined;
  // Mesmo endereço (ou só a âncora): nada a carregar.
  if (url.pathname === window.location.pathname && url.search === window.location.search) {
    return undefined;
  }
  return url;
}

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
        <span className="rounded-md bg-primary px-3 py-1 text-sm font-medium text-primary-foreground">
          Carregando…
        </span>
      )}
    </div>
  );
}
