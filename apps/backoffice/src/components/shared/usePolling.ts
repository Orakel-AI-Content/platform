'use client';

import { useEffect } from 'react';

/**
 * Consulta periódica (#636): enquanto `active`, roda `poll` a cada `intervalMs`. Um tique
 * com a consulta anterior ainda em andamento é pulado, e uma rejeição é ignorada (a próxima
 * tentativa resolve; quem precisa tratar o erro trata dentro de `poll`). Inativo, não cria
 * timer. O timer é limpo ao desativar, ao trocar `poll` ou `intervalMs` e ao desmontar;
 * `poll` entra nas dependências, então quem chama o memoriza com `useCallback`.
 */
export function usePolling(
  active: boolean,
  poll: () => Promise<unknown>,
  intervalMs: number,
): void {
  useEffect(() => {
    if (!active) return;
    let busy = false;
    const timer = setInterval(() => {
      if (busy) return;
      busy = true;
      void poll()
        .catch(() => undefined)
        .finally(() => {
          busy = false;
        });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [active, poll, intervalMs]);
}
