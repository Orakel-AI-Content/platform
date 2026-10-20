import { InfoField, InfoList } from '@/components/shared/InfoList';
import { SITE_STATE_LABEL, SITE_STATE_VARIANT } from '@/components/shared/siteLabels.ts';
import Card from '@/components/ui/Card';
import type { SiteSummary } from '@/domain/sites/sites.ts';

import {
  LastBuildSummary,
  PendingCount,
  PublishNowPanel,
  StateTag,
  type PublishNow,
} from './SiteStatus.tsx';

/**
 * Resumo da página do site (#370), o cartão de perfil do `CustomerDetails` do Ecme: os dados do
 * site no `InfoList` e, ao pé, "Publicar agora". `publish` só vem de quem pode publicar
 * (`operations.run` e site não pausado); sem ele, o botão não aparece. Sem estado próprio: o
 * `PublishNowPanel` é o único Client Component dentro dele.
 */
export function SiteSummaryCard({
  site,
  g1Registered,
  publish,
}: {
  site: SiteSummary;
  g1Registered: boolean;
  publish?: PublishNow;
}) {
  return (
    <Card
      className="min-w-[330px] xl:max-w-[330px] 2xl:max-w-[400px] 2xl:min-w-[400px]"
      bodyClass="flex flex-col gap-6"
    >
      <InfoList className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-1">
        <InfoField label="Domínio">{site.domain}</InfoField>
        <InfoField label="Indexável">{site.indexavel ? 'Sim' : 'Não'}</InfoField>
        <InfoField label="Estado">
          <StateTag color={SITE_STATE_VARIANT[site.state]}>{SITE_STATE_LABEL[site.state]}</StateTag>
          {site.state === 'pausado' && site.pausedReason && (
            <p className="mt-1 font-normal">{site.pausedReason}</p>
          )}
        </InfoField>
        <InfoField label="Release">{site.release ?? 'Sem release'}</InfoField>
        <InfoField label="Mudanças pendentes" className="tabular-nums">
          <PendingCount siteId={site.id} count={site.pendingChanges} />
        </InfoField>
        <InfoField label="Último build">
          <LastBuildSummary build={site.lastBuild} timeZone={site.timeZone} />
        </InfoField>
        <InfoField label="G1">{g1Registered ? 'Registrado' : 'Não registrado'}</InfoField>
      </InfoList>
      {publish && <PublishNowPanel siteId={site.id} action={publish} />}
    </Card>
  );
}
