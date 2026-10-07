'use client';

import { ErrorScreen } from '@/components/error-screen';

// Exceção numa página de (admin) (#77): a tela aparece dentro do layout, com o cabeçalho.
// Falha no próprio layout de (admin) não passa por aqui: sobe até o global-error.tsx.
// `retry` busca e renderiza o trecho de novo (o `reset` só renderizaria, sem buscar).
export default function AdminError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <ErrorScreen digest={error.digest} retry={retry} />;
}
