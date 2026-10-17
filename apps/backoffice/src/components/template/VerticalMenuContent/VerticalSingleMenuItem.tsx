// Ecme v1.3.10 (e5f9a1d): src/components/template/VerticalMenuContent/VerticalSingleMenuItem.tsx
// Adaptado (#237): só o item expandido (`DefaultItem`); o recolhido, com a dica, entra com o
// recolher (#238). `next/link` no lugar do `Link` do react-router, o caminho já resolvido para o
// site (`navigationPath`, #236) e `aria-current="page"` no link do item ativo. Sem
// `AuthorityCheck`: a árvore chega filtrada do servidor (`filterNavigation`).
import Link from 'next/link';
import { Menu } from '@/components/ui/Menu';
import VerticalMenuIcon from './VerticalMenuIcon';
import type { NavigationTree } from '@/configs/navigation.config';

const { MenuItem } = Menu;

type VerticalSingleMenuItemProps = {
  nav: NavigationTree;
  path: string;
  isActive: boolean;
  showIcon?: boolean;
  onLinkClick?: (link: { key: string; title: string; path: string }) => void;
};

const VerticalSingleMenuItem = ({
  nav,
  path,
  isActive,
  showIcon = true,
  onLinkClick,
}: VerticalSingleMenuItemProps) => {
  return (
    <MenuItem eventKey={nav.key}>
      <Link
        href={path}
        aria-current={isActive ? 'page' : undefined}
        className="flex items-center gap-2 h-full w-full"
        target={nav.isExternalLink ? '_blank' : undefined}
        onClick={() => onLinkClick?.({ key: nav.key, title: nav.title, path })}
      >
        {showIcon && <VerticalMenuIcon icon={nav.icon} />}
        <span>{nav.title}</span>
      </Link>
    </MenuItem>
  );
};

export default VerticalSingleMenuItem;
