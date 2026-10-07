import { StatusScreen } from '@/components/status-screen';
import { Button } from '@/components/ui/button';

// Conteúdo da tela de erro (#77), comum ao error.tsx de (admin) e ao global-error.tsx. Nunca
// mostra a mensagem nem a pilha da exceção: só o digest, que liga a tela aos logs.

export function ErrorScreen({ digest, retry }: { digest?: string; retry: () => void }) {
  return (
    <StatusScreen
      title="Algo deu errado"
      action={<Button onClick={() => retry()}>Tentar de novo</Button>}
    >
      <p>A tela não pôde ser carregada. Tente de novo; se continuar, avise a equipe.</p>
      {digest && <p className="mt-2 text-sm">Código do erro: {digest}</p>}
    </StatusScreen>
  );
}
