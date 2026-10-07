import Link from 'next/link';

import { StatusScreen } from '@/components/status-screen';
import { buttonVariants } from '@/components/ui/button';

// "Não encontrado" dentro do layout (admin) (#77): `notFound()` das páginas e o catch-all
// `[...rest]` caem aqui, com o cabeçalho do Backoffice (o 404 padrão do Next fica fora dele).
export default function NotFound() {
  return (
    <StatusScreen
      title="Página não encontrada"
      action={
        <Link href="/sites" className={buttonVariants({ variant: 'outline' })}>
          Ir para a lista de sites
        </Link>
      }
    >
      O endereço não existe ou o item foi removido.
    </StatusScreen>
  );
}
