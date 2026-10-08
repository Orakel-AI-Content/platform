'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { ActionsMenu } from '@/components/ui/actions-menu';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
 * Seletor de site no topo da barra lateral (workspace#42): o nome do site abre a lista dos
 * sites que a pessoa pode ver (vinda do servidor, `listSites`), cada um levando à mesma área.
 * O `ActionsMenu` (Popover nativo) abre, fecha com Esc e devolve o foco ao botão.
 */
export function SiteSwitcher({
  current,
  sites,
}: {
  current: SwitcherSite;
  sites: readonly SwitcherSite[];
}) {
  const pathname = usePathname();
  return (
    <ActionsMenu
      text={{ visible: current.name, label: `${current.name}, trocar de site` }}
      align="start"
      className="w-full justify-start truncate"
    >
      {sites.map((site) => {
        const isCurrent = site.id === current.id;
        return (
          <Link
            key={site.id}
            href={sameAreaIn(pathname, site.id)}
            aria-current={isCurrent ? 'true' : undefined}
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'sm' }),
              'justify-start',
              isCurrent && 'bg-muted font-semibold',
            )}
          >
            {site.name}
          </Link>
        );
      })}
    </ActionsMenu>
  );
}
