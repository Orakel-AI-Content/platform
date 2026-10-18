import { backToSites } from '@/components/forbidden-screen';
import { StatusScreen } from '@/components/status-screen';
import ButtonLink from '@/components/ui/Button/ButtonLink';

// "Não encontrado" dentro do layout (admin) (#77): `notFound()` das páginas e o catch-all
// `[...rest]` caem aqui, com o cabeçalho do Backoffice (o 404 padrão do Next fica fora dele).
export default function NotFound() {
  return (
    <StatusScreen
      title="Página não encontrada"
      action={<ButtonLink href={backToSites.href}>{backToSites.label}</ButtonLink>}
    >
      O endereço não existe ou o item foi removido.
    </StatusScreen>
  );
}
