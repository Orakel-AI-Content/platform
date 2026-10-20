import FileNotFound from '@/assets/svg/FileNotFound';
import { backToSites } from '@/components/shared/ForbiddenScreen';
import { StatusScreen } from '@/components/shared/StatusScreen';
import ButtonLink from '@/components/ui/Button/ButtonLink';

// "Não encontrado" dentro do layout (admin) (#77): `notFound()` das páginas e o catch-all
// `[...rest]` caem aqui, com o cabeçalho do Backoffice (o 404 padrão do Next fica fora dele).
export default function NotFound() {
  return (
    <StatusScreen
      title="Página não encontrada"
      illustration={<FileNotFound height={280} width={280} />}
      action={<ButtonLink href={backToSites.href}>{backToSites.label}</ButtonLink>}
    >
      O endereço não existe ou o item foi removido.
    </StatusScreen>
  );
}
