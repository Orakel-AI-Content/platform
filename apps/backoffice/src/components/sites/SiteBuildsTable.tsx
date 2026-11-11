import { EmptyState } from '@/components/shared/EmptyState';
import {
  BUILD_STATUS_LABEL,
  BUILD_STATUS_VARIANT,
  formatDateTime,
} from '@/components/shared/siteLabels.ts';
import Table from '@/components/ui/Table';
import type { SiteInstance } from '@/domain/sites/sites.ts';

import { StateTag } from './SiteStatus.tsx';

const { THead, TBody, Tr, Th, Td } = Table;

/**
 * Últimos builds do site na aba "Builds" (#595), do mais novo para o mais antigo: a `Table` do
 * Ecme direto, como no `CustomerDetails`, sem busca, ordem nem paginação (são só os
 * `RECENT_BUILDS_LIMIT` de `SiteInstance.recentBuilds`). Status na `StateTag`, data no fuso do
 * site e "—" no build sem versão. Sem builds, o `EmptyState`. Sem estado: serve ao Server
 * Component da página. A tabela rola na horizontal dentro do próprio contêiner, se faltar
 * espaço.
 */
export function SiteBuildsTable({
  builds,
  timeZone,
}: {
  builds: SiteInstance['recentBuilds'];
  timeZone: string;
}) {
  if (builds.length === 0) return <EmptyState>Nenhum build ainda.</EmptyState>;
  return (
    <Table aria-label="Últimos builds">
      <THead>
        <Tr>
          <Th>Status</Th>
          <Th>Data</Th>
          <Th>Release</Th>
          <Th>Versão</Th>
        </Tr>
      </THead>
      <TBody>
        {builds.map((build) => (
          <Tr key={build.id}>
            <Td>
              <StateTag color={BUILD_STATUS_VARIANT[build.status]}>
                {BUILD_STATUS_LABEL[build.status]}
              </StateTag>
            </Td>
            <Td className="whitespace-nowrap">
              {formatDateTime(new Date(build.finishedAt), timeZone)}
            </Td>
            <Td>{build.release}</Td>
            <Td className="wrap-anywhere">{build.versionId ?? '—'}</Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}
