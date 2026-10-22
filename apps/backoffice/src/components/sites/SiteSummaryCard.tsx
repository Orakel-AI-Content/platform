import {
  DETAIL_SUMMARY_CLASS,
  DETAIL_SUMMARY_LIST_CLASS,
} from '@/components/shared/detailSummary.ts';
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
    <Card className={DETAIL_SUMMARY_CLASS} bodyClass="flex flex-col gap-6">
      <InfoList className={DETAIL_SUMMARY_LIST_CLASS}>
        <InfoField label="Domínio">{site.domain}</InfoField>
        <InfoField label="Indexável">{site.indexavel ? 'Sim' : 'Não'}</InfoField>
        <InfoField label="Status">
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
