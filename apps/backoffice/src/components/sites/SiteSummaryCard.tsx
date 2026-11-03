import {
  DETAIL_SUMMARY_CLASS,
  DETAIL_SUMMARY_LIST_CLASS,
} from '@/components/shared/detailSummary.ts';
import { InfoField, InfoList } from '@/components/shared/InfoList';
import Card from '@/components/ui/Card';
import type { SiteSummary } from '@/domain/sites/sites.ts';

import {
  LastBuildSummary,
  PendingCount,
  PublishNowPanel,
  SiteStateIndicator,
  type PublishNow,
} from './SiteStatus.tsx';

/**
 * Resumo da página do site (#370), o cartão de perfil do `CustomerDetails` do Ecme: os dados do
 * site no `InfoList` (com o uso do limite diário de hoje) e, ao pé, "Publicar agora". `publish` só vem de quem pode publicar
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
    <Card className={DETAIL_SUMMARY_CLASS} bodyClass="flex flex-col gap-6">
      <InfoList className={DETAIL_SUMMARY_LIST_CLASS}>
        <InfoField label="Domínio">{site.domain}</InfoField>
        <InfoField label="Indexável">{site.indexavel ? 'Sim' : 'Não'}</InfoField>
        <InfoField label="Status">
          <SiteStateIndicator site={site} />
        </InfoField>
        <InfoField label="Release">{site.release ?? 'Sem release'}</InfoField>
        <InfoField label="Mudanças pendentes" className="tabular-nums">
          <PendingCount siteId={site.id} count={site.pendingChanges} />
        </InfoField>
        <InfoField label="Último build">
          <LastBuildSummary build={site.lastBuild} timeZone={site.timeZone} />
        </InfoField>
        <InfoField label="G1">{g1Registered ? 'Registrado' : 'Não registrado'}</InfoField>
        <InfoField label="Publicações hoje" className="tabular-nums">
          {site.publishedToday} de {site.effectiveDailyPublishLimit}
          {site.publishedToday >= site.effectiveDailyPublishLimit && (
            <p className="mt-1 font-normal">Limite do dia atingido.</p>
          )}
        </InfoField>
      </InfoList>
      {publish && <PublishNowPanel siteId={site.id} action={publish} />}
    </Card>
  );
}
