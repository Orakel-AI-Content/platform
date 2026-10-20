import SpaceSignBoard from '@/assets/svg/SpaceSignBoard';
import { StatusScreen } from '@/components/shared/StatusScreen';
import { LOGOUT_PATH } from '@/components/template/UserProfileDropdown';
import { Button } from '@/components/ui/Button';

// Tela "Sem acesso" do layout de (admin) (#380): identidade sem cadastro ou sem papel. Não é o
// ForbiddenScreen: não há ação do RBAC para citar nem página do app para onde voltar, então a
// única saída é sair pelo Access.

export function NoAccessScreen() {
  return (
    <StatusScreen
      title="Sem acesso"
      illustration={<SpaceSignBoard height={280} width={280} />}
      action={
        // Rota do Access, fora do app: <a> com `href`, não ButtonLink (sem prefetch nem
        // navegação pelo cliente).
        <Button asElement="a" href={LOGOUT_PATH}>
          Sair
        </Button>
      }
    >
      <p>Sua identidade não tem acesso ao Backoffice. Peça a uma pessoa administradora.</p>
    </StatusScreen>
  );
}
