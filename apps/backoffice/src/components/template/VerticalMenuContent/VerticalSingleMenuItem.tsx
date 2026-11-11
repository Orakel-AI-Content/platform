// Ecme v1.3.10 (e5f9a1d): src/components/template/VerticalMenuContent/VerticalSingleMenuItem.tsx
// Adaptado (#237, #238): `DefaultItem` e, com a barra recolhida, o `CollapsedItem` só com o
// ícone e a dica à direita (`Tooltip`); o título fica em `sr-only`, para o nome do link continuar
// o da área (o Ecme o tirava). A dica fica dentro do <li>, em volta do link, que recebe o
// `aria-describedby`: em volta do <li>, o <span> dela ficaria solto na <ul>. `next/link` no lugar do `Link` do react-router, o caminho já resolvido para o
// site (`navigationPath`, #236) e `aria-current="page"` no link do item ativo. Sem
// `AuthorityCheck`: a árvore chega filtrada do servidor (`filterNavigation`). Com `count`
// (#583), o `Badge` do Ecme à direita do título, em `primary` (contagem é informação, não o
// `error` padrão), fora da árvore de acessibilidade: o nome do link ganha a contagem por
// extenso no `aria-label`, começando pelo título à vista ("Revisão, 2 aguardando"; WCAG 2.5.3),
// e a dica da barra recolhida também. Um <span> `sr-only` não serve: o `position: absolute`
// faz dele bloco, e o nome sai "Revisão , 2 aguardando".
'use client';

import Link from 'next/link';
import Badge from '@/components/ui/Badge';
import { Menu } from '@/components/ui/Menu';
import Tooltip from '@/components/ui/Tooltip';
import VerticalMenuIcon from './VerticalMenuIcon';
import type { NavigationTree } from '@/configs/navigation.config';

const { MenuItem } = Menu;

/** Selo de um item: o número e o texto dele no nome acessível ("2 aguardando"). */
export type NavItemCount = { count: number; label: string };

type VerticalSingleMenuItemProps = {
  nav: NavigationTree;
  path: string;
  isActive: boolean;
  sideCollapsed?: boolean;
  showIcon?: boolean;
  count?: NavItemCount;
  onLinkClick?: (link: { key: string; title: string; path: string }) => void;
};

const VerticalSingleMenuItem = ({
  nav,
  path,
  isActive,
  sideCollapsed = false,
  showIcon = true,
  count,
  onLinkClick,
}: VerticalSingleMenuItemProps) => {
  const label = count ? `${nav.title}, ${count.label}` : undefined;
  const link = (
    <Link
      href={path}
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
      className="flex items-center gap-2 h-full w-full"
      target={nav.isExternalLink ? '_blank' : undefined}
      onClick={() => onLinkClick?.({ key: nav.key, title: nav.title, path })}
    >
      {showIcon && <VerticalMenuIcon icon={nav.icon} />}
      <span className={sideCollapsed ? 'sr-only' : undefined}>{nav.title}</span>
      {count && !sideCollapsed && (
        <Badge aria-hidden="true" content={count.count} className="ml-auto bg-primary" />
      )}
    </Link>
  );

  return (
    <MenuItem eventKey={nav.key}>
      {sideCollapsed ? (
        <Tooltip title={label ?? nav.title} placement="right" wrapperClass="flex h-full w-full">
          {link}
        </Tooltip>
      ) : (
        link
      )}
    </MenuItem>
  );
};

export default VerticalSingleMenuItem;
