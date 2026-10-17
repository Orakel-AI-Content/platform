// Ecme v1.3.10 (e5f9a1d): src/components/ui/hooks/useUniqueId.ts
'use client';

// Adaptado para o SSR (#205): o Ecme gera o id com `uniqueId` do es-toolkit e `Math.random`,
// diferente no servidor e no navegador (hydration mismatch). Aqui vem do `useId` do React, o
// mesmo nos dois lados; `len` fica na assinatura por compatibilidade com quem chama.
import { useId } from 'react';

export default function useUniqueId(prefix = '', len = 10) {
  void len;
  return `${prefix}${useId()}`;
}
