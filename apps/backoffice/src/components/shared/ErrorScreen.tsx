'use client';

import NoDataFound from '@/assets/svg/NoDataFound';
import { StatusScreen } from '@/components/shared/StatusScreen';
import { Button } from '@/components/ui/Button';

// Conteúdo da tela de erro (#77), comum ao error.tsx de (admin) e ao global-error.tsx. Nunca
// mostra a mensagem nem a pilha da exceção: só o digest, que liga a tela aos logs.

export function ErrorScreen({ digest, retry }: { digest?: string; retry: () => void }) {
  return (
    <StatusScreen
      title="Algo deu errado"
      illustration={<NoDataFound height={280} width={280} />}
      action={
        <Button variant="solid" onClick={() => retry()}>
          Tentar de novo
        </Button>
      }
    >
      <p>A tela não pôde ser carregada. Tente de novo; se continuar, avise a equipe.</p>
      {digest && <p className="mt-2">Código do erro: {digest}</p>}
    </StatusScreen>
  );
}
