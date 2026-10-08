'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Área da barra: `segment` é o primeiro segmento depois de `/sites/<site>/` ('' = Visão geral). */
export type SiteNavItem = { segment: string; label: string };

/** Telas que só se alcançam pela Visão geral: destacam a Visão geral. */
const OVERVIEW_SEGMENTS = new Set(['', 'configuracao', 'pendencias']);

/** Primeiro segmento depois de `/sites/<site>/`, ou '' na página do site. */
function currentSegment(pathname: string): string {
  return pathname.split('/')[3] ?? '';
}

/**
 * Barra lateral do site (workspace#42): as áreas, com a atual destacada e `aria-current`,
 * também nas telas de item, criar e editar. Os itens (e a permissão de cada um) vêm do
 * servidor; aqui só se marca a área pelo endereço.
 */
export function SiteNav({ siteId, items }: { siteId: string; items: readonly SiteNavItem[] }) {
  const pathname = usePathname();
  const segment = currentSegment(pathname);
  const active = OVERVIEW_SEGMENTS.has(segment) ? '' : segment;
  return (
    <nav aria-label="Áreas do site">
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const current = item.segment === active;
          return (
            <li key={item.segment}>
              <Link
                href={item.segment === '' ? `/sites/${siteId}` : `/sites/${siteId}/${item.segment}`}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  buttonVariants({ variant: 'ghost', size: 'sm' }),
                  'w-full justify-start',
                  current && 'bg-muted font-semibold',
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
