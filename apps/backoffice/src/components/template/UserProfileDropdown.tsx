// Ecme v1.3.10 (e5f9a1d): src/components/template/UserProfileDropdown.tsx
// Adaptado (#239; workspace#46):
// - sem `useSessionUser` nem `useAuth`: o e-mail e os papéis vêm do actor do layout do admin,
//   e "Sair" é um link para a rota do Cloudflare Access (`<a>`, fora do app), não o `signOut`;
// - sem os itens demo (Profile, Account Setting, Activity Log) e sem `withHeaderItem`;
// - o avatar é o ícone (o Access não traz foto), e o gatilho leva "Perfil de <e-mail> ·
//   <papéis>" em `sr-only`: é o nome do botão e mantém o e-mail e os papéis no `banner` com o
//   menu fechado (o Ecme só mostrava o avatar, sem nome acessível);
// - o cabeçalho do menu mostra o e-mail (o Backoffice não tem nome de exibição) e os papéis;
//   ícones `aria-hidden`.
'use client';

import { PiSignOutDuotone, PiUserDuotone } from 'react-icons/pi';
import Avatar from '@/components/ui/Avatar';
import Dropdown from '@/components/ui/Dropdown';

/** Rota do Access que encerra a sessão. */
export const LOGOUT_PATH = '/cdn-cgi/access/logout';

type UserProfileDropdownProps = {
  email: string;
  roles: readonly string[];
};

const UserProfileDropdown = ({ email, roles }: UserProfileDropdownProps) => {
  const roleList = roles.join(', ');
  const avatarProps = { icon: <PiUserDuotone aria-hidden /> };

  return (
    <Dropdown
      className="flex"
      toggleClassName="flex items-center header-action-item header-action-item-hoverable"
      renderTitle={
        <div className="cursor-pointer flex items-center">
          <Avatar size={32} {...avatarProps} />
          <span className="sr-only">
            Perfil de {email} · {roleList}
          </span>
        </div>
      }
      placement="bottom-end"
    >
      <Dropdown.Item variant="header">
        <div className="py-2 px-3 flex items-center gap-3">
          <Avatar {...avatarProps} />
          <div>
            <div className="font-bold text-gray-900 dark:text-gray-100">{email}</div>
            <div className="text-xs">{roleList}</div>
          </div>
        </div>
      </Dropdown.Item>
      <Dropdown.Item variant="divider" />
      {/* Rota do Access, fora do app: <a> com `href`, não <Link> (sem prefetch nem navegação
          pelo cliente). */}
      <Dropdown.Item asElement="a" href={LOGOUT_PATH} eventKey="sair" className="gap-2">
        <span className="text-xl">
          <PiSignOutDuotone aria-hidden />
        </span>
        <span>Sair</span>
      </Dropdown.Item>
    </Dropdown>
  );
};

export default UserProfileDropdown;
