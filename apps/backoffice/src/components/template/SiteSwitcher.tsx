'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PiCaretUpDownDuotone } from 'react-icons/pi';

import Dropdown from '@/components/ui/Dropdown';
import Tooltip from '@/components/ui/Tooltip';
import classNames from '@/components/ui/utils/classNames';

export type SwitcherSite = { id: string; name: string };

/**
 * Endereço da mesma área noutro site: só o primeiro segmento depois de `/sites/<site>/` é
 * mantido, então telas de item, criar e editar levam à lista da área.
 */
export function sameAreaIn(pathname: string, siteId: string): string {
  const segment = pathname.split('/')[3] ?? '';
  return segment === '' ? `/sites/${siteId}` : `/sites/${siteId}/${segment}`;
}

/**
 * Iniciais da barra recolhida: a primeira letra das duas primeiras palavras do nome, em
 * maiúscula, ignorando pontuação ("Exemplo A — Guias" → "EA").
 */
export function siteInitials(name: string): string {
  return (name.match(/[\p{L}\p{N}]+/gu) ?? [])
    .slice(0, 2)
    .map((word) => word.charAt(0).toLocaleUpperCase('pt-BR'))
    .join('');
}

/**
 * Seletor de site no topo da barra lateral (workspace#42, #241): o `Dropdown` do Ecme com os
 * sites que a pessoa pode ver (vindos do servidor, `listSites`), cada um um `menuitem` em
 * `next/link` que leva à mesma área. O Dropdown dá o teclado dos outros menus da moldura
 * (setas, typeahead, Esc com o foco de volta). Recolhida, a barra mostra as iniciais, com o
 * mesmo nome acessível e o nome do site na dica à direita.
 */
export function SiteSwitcher({
  current,
  sites,
  collapsed = false,
}: {
  current: SwitcherSite;
  sites: readonly SwitcherSite[];
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const name = `${current.name}, trocar de site`;

  const dropdown = (
    <Dropdown
      activeKey={current.id}
      toggleClassName={classNames(
        'flex items-center rounded-lg border border-gray-200 font-semibold text-gray-900 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-700',
        collapsed ? 'h-10 w-10 justify-center' : 'h-10 w-full justify-between gap-2 px-3',
      )}
      // O nome fica em `sr-only`, igual nos dois estados; o que se vê (nome ou iniciais) é
      // `aria-hidden`.
      renderTitle={
        <>
          <span aria-hidden="true" className={collapsed ? undefined : 'truncate'}>
            {collapsed ? siteInitials(current.name) : current.name}
          </span>
          <span className="sr-only">{name}</span>
          {!collapsed && <PiCaretUpDownDuotone aria-hidden className="shrink-0 text-lg" />}
        </>
      }
      placement={collapsed ? 'right-start' : 'bottom-start'}
      // A lista pode passar de 20 sites: rola dentro do menu, e as setas levam o foco (e a
      // rolagem) a qualquer um.
      menuClass="max-h-[50vh] overflow-y-auto"
    >
      {sites.map((site) => (
        <Dropdown.Item
          key={site.id}
          asElement={Link}
          href={sameAreaIn(pathname, site.id)}
          eventKey={site.id}
          aria-current={site.id === current.id ? 'true' : undefined}
        >
          {site.name}
        </Dropdown.Item>
      ))}
    </Dropdown>
  );

  return collapsed ? (
    <Tooltip title={current.name} placement="right" wrapperClass="flex">
      {dropdown}
    </Tooltip>
  ) : (
    dropdown
  );
}
