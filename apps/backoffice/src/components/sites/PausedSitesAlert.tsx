import Link from 'next/link';

import { Alert } from '@/components/ui/Alert';
import type { SiteSummary } from '@/domain/sites/sites.ts';

export type PausedSite = Pick<SiteSummary, 'id' | 'name' | 'pausedReason'>;

/**
 * Aviso global de site pausado (#511, workspace#21 R2), no topo de toda tela da área
 * autenticada: o `Alert` de aviso do Ecme com um link para a página de cada site pausado, onde
 * ficam o motivo e o conteúdo culpado. Sem site pausado, nada.
 */
export function PausedSitesAlert({ sites }: { sites: readonly PausedSite[] }) {
  if (sites.length === 0) return null;
  const title = sites.length === 1 ? 'Site pausado' : `${sites.length} sites pausados`;
  return (
    <Alert type="warning" showIcon duration={0} title={title} className="mb-4">
      <p className="text-sm">
        O build falhou e as mudanças ficam represadas até o site ser retomado.
      </p>
      <ul className="mt-1 text-sm">
        {sites.map((site) => (
          <li key={site.id}>
            <Link
              href={`/sites/${site.id}`}
              className="font-semibold underline underline-offset-4 hover:text-primary"
            >
              {site.name}
            </Link>
            {site.pausedReason && `: ${site.pausedReason}`}
          </li>
        ))}
      </ul>
    </Alert>
  );
}
