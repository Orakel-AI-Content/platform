import {
  DETAIL_SUMMARY_CLASS,
  DETAIL_SUMMARY_LIST_CLASS,
} from '@/components/shared/detailSummary.ts';
import { InfoField, InfoList } from '@/components/shared/InfoList';
import Card from '@/components/ui/Card';
import type { RollbackVersion } from '@/domain/builds/builds.ts';
import type { SiteSummary } from '@/domain/sites/sites.ts';

import { RebuildReleaseDialog, type RebuildOnRelease } from './RebuildReleaseDialog.tsx';
import { RollbackDialog, type RollbackSite } from './RollbackDialog.tsx';
import {
  LastBuildSummary,
  PendingCount,
  PublishNowPanel,
  ResumeSitePanel,
  SiteStateIndicator,
  type PublishNow,
  type ResumeSite,
} from './SiteStatus.tsx';

/**
 * Resumo da página do site (#370), o cartão de perfil do `CustomerDetails` do Ecme: os dados do
 * site no `InfoList` (com o uso do limite diário de hoje) e, ao pé, "Publicar agora" ou, com o
 * site pausado, "Retomar", e "Reconstruir na release" (#515) e "Reverter" (#514) nos dois
 * estados. `publish`, `resume`, `rebuild` e `rollback` só vêm de quem tem `operations.run`; publicar e retomar aparecem só no estado
 * deles (publicar com o site não pausado, retomar com ele pausado). Sem estado próprio: os
 * painéis são os únicos Client Components dentro dele.
 */
export function SiteSummaryCard({
  site,
  g1Registered,
  publish,
  resume,
  rebuild,
  rollback,
}: {
  site: SiteSummary;
  g1Registered: boolean;
  publish?: PublishNow;
  resume?: ResumeSite;
  /** Releases registradas e a action de reconstruir, já ligada ao site. */
  rebuild?: { releases: readonly string[]; action: RebuildOnRelease };
  /** Versões revertíveis (sem a ativa) e a action de reverter, já ligada ao site. */
  rollback?: { versions: readonly RollbackVersion[]; action: RollbackSite };
}) {
  const paused = site.state === 'pausado';
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
      {publish && !paused && <PublishNowPanel siteId={site.id} action={publish} />}
      {resume && paused && <ResumeSitePanel siteId={site.id} action={resume} />}
      {rebuild && (
        <RebuildReleaseDialog
          current={site.release}
          paused={paused}
          releases={rebuild.releases}
          action={rebuild.action}
        />
      )}
      {rollback && (
        <RollbackDialog
          versions={rollback.versions}
          timeZone={site.timeZone}
          action={rollback.action}
        />
      )}
    </Card>
  );
}
