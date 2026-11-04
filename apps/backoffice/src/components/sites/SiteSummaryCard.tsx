import {
  DETAIL_SUMMARY_CLASS,
  DETAIL_SUMMARY_LIST_CLASS,
} from '@/components/shared/detailSummary.ts';
import { EmptyState } from '@/components/shared/EmptyState';
import { InfoField, InfoList } from '@/components/shared/InfoList';
import {
  BUILD_STATUS_LABEL,
  BUILD_STATUS_VARIANT,
  PENDING_ORIGIN_LABEL,
  SITE_STATE_LABEL,
  SITE_STATE_VARIANT,
  formatDateTime,
} from '@/components/shared/siteLabels.ts';
import Card from '@/components/ui/Card';
import type { SiteInstance, SiteSummary } from '@/domain/sites/sites.ts';

import {
  PendingCount,
  PublishNowPanel,
  ResumeSitePanel,
  StateTag,
  type PublishNow,
  type ResumeSite,
} from './SiteStatus.tsx';

/** Versão no ar e, abaixo, os arquivos do build que a publicou. */
function ActiveVersion({ versionId, files }: { versionId: string | null; files: number | null }) {
  if (versionId === null) return <span>Nenhuma versão no ar</span>;
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span>{versionId}</span>
      {files !== null && (
        <span className="text-xs tabular-nums">
          {files} {files === 1 ? 'arquivo' : 'arquivos'}
        </span>
      )}
    </span>
  );
}

/** Mudanças pendentes agrupadas por origem, com a contagem de cada uma. */
function PendingByOrigin({ counts }: { counts: SiteInstance['pendingByOrigin'] }) {
  if (counts.length === 0) return <EmptyState>Nenhuma mudança pendente.</EmptyState>;
  return (
    <ul className="space-y-1">
      {counts.map(({ origin, count }) => (
        <li key={origin} className="flex justify-between gap-4">
          <span>{PENDING_ORIGIN_LABEL[origin]}</span>
          <span className="tabular-nums">{count}</span>
        </li>
      ))}
    </ul>
  );
}

/** Os últimos builds, do mais novo para o mais antigo: resultado e, abaixo, data, release e versão. */
function RecentBuilds({
  builds,
  timeZone,
}: {
  builds: SiteInstance['recentBuilds'];
  timeZone: string;
}) {
  if (builds.length === 0) return <EmptyState>Nenhum build ainda.</EmptyState>;
  return (
    <ol className="space-y-3">
      {builds.map((build) => (
        <li key={build.id} className="flex flex-col items-start gap-0.5">
          <StateTag color={BUILD_STATUS_VARIANT[build.status]}>
            {BUILD_STATUS_LABEL[build.status]}
          </StateTag>
          <span className="text-xs">
            {[formatDateTime(new Date(build.finishedAt), timeZone), build.release, build.versionId]
              .filter((part) => part !== null)
              .join(' · ')}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Resumo da página do site (#370), o cartão de perfil do `CustomerDetails` do Ecme: os dados do
 * site no `InfoList` (com o uso do limite diário de hoje), o estado da instância que só a página
 * lê (#516: versão no ar com os arquivos, pendências por origem e últimos builds, cada um com o
 * estado vazio) e, ao pé, "Publicar agora" ou, com o
 * site pausado, "Retomar". `publish` e `resume` só vêm de quem tem `operations.run`; cada botão
 * aparece só no estado dele (publicar com o site não pausado, retomar com ele pausado). Sem
 * estado próprio: os painéis são os únicos Client Components dentro dele.
 */
export function SiteSummaryCard({
  site,
  instance,
  g1Registered,
  publish,
  resume,
}: {
  site: SiteSummary;
  instance: SiteInstance;
  g1Registered: boolean;
  publish?: PublishNow;
  resume?: ResumeSite;
}) {
  const paused = site.state === 'pausado';
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
        <InfoField label="Versão no ar">
          <ActiveVersion versionId={site.activeVersionId} files={instance.activeFiles} />
        </InfoField>
        <InfoField label="Mudanças pendentes" className="tabular-nums">
          <PendingCount siteId={site.id} count={site.pendingChanges} />
        </InfoField>
        <InfoField label="Pendências por origem">
          <PendingByOrigin counts={instance.pendingByOrigin} />
        </InfoField>
        <InfoField label="Últimos builds">
          <RecentBuilds builds={instance.recentBuilds} timeZone={site.timeZone} />
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
    </Card>
  );
}
