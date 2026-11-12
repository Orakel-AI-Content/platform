import {
  DETAIL_SUMMARY_CLASS,
  DETAIL_SUMMARY_LIST_CLASS,
} from '@/components/shared/detailSummary.ts';
import { InfoField, InfoList } from '@/components/shared/InfoList';
import { PENDING_ORIGIN_LABEL } from '@/components/shared/siteLabels.ts';
import Card from '@/components/ui/Card';
import classNames from '@/components/ui/utils/classNames';
import type { SiteInstance, SiteSummary } from '@/domain/sites/sites.ts';

import { PendingCount, SiteStateIndicator } from './SiteStatus.tsx';

/** O domínio abre o site no ar em nova aba, como na lista de sites (#586); sem domínio, "—". */
function DomainLink({ domain }: { domain: string }) {
  if (!domain) return <span>—</span>;
  return (
    <a
      href={`https://${domain}`}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-4 hover:text-primary"
    >
      {domain}
      <span className="sr-only"> (abre em nova aba)</span>
    </a>
  );
}

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

/**
 * Mudanças pendentes: o total (link para a tela de pendências quando > 0) e, abaixo, a divisão
 * por origem em duas colunas. Num campo só e em duas colunas, o resumo cabe na primeira tela a
 * 1440 × 900 com todas as origens (#595).
 */
function PendingChanges({
  siteId,
  count,
  byOrigin,
}: {
  siteId: string;
  count: number;
  byOrigin: SiteInstance['pendingByOrigin'];
}) {
  return (
    <span className="flex flex-col items-start gap-1">
      <PendingCount siteId={siteId} count={count} />
      {byOrigin.length > 0 && (
        <ul aria-label="Por origem" className="grid w-full grid-cols-2 gap-x-4 gap-y-1 font-normal">
          {byOrigin.map(({ origin, count: originCount }) => (
            <li key={origin} className="flex justify-between gap-2">
              <span>{PENDING_ORIGIN_LABEL[origin]}</span>
              <span className="tabular-nums">{originCount}</span>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}

/**
 * Resumo da página do site (#370), o cartão de perfil do `CustomerDetails` do Ecme: só o estado
 * atual do site no `InfoList` (com o uso do limite diário de hoje), sem botões (#595): as ações
 * de operação ficam no cabeçalho (`SiteOperations`) e o histórico na aba "Histórico". Sem
 * estado: serve ao Server Component da página.
 */
export function SiteSummaryCard({
  site,
  instance,
  g1Registered,
}: {
  site: SiteSummary;
  instance: SiteInstance;
  g1Registered: boolean;
}) {
  return (
    // `xl:self-start`: lado a lado, o cartão não estica até a altura da coluna da direita
    // (cartões de conteúdo e abas) e termina com o conteúdo, na primeira tela (#595).
    <Card className={classNames(DETAIL_SUMMARY_CLASS, 'xl:self-start')}>
      <InfoList className={DETAIL_SUMMARY_LIST_CLASS}>
        <InfoField label="Domínio">
          <DomainLink domain={site.domain} />
        </InfoField>
        <InfoField label="Indexável">{site.indexavel ? 'Sim' : 'Não'}</InfoField>
        <InfoField label="Status">
          <SiteStateIndicator site={site} />
        </InfoField>
        <InfoField label="Release">{site.release ?? 'Sem release'}</InfoField>
        <InfoField label="Versão no ar">
          <ActiveVersion versionId={site.activeVersionId} files={instance.activeFiles} />
        </InfoField>
        <InfoField label="Mudanças pendentes">
          <PendingChanges
            siteId={site.id}
            count={site.pendingChanges}
            byOrigin={instance.pendingByOrigin}
          />
        </InfoField>
        <InfoField label="G1">{g1Registered ? 'Registrado' : 'Não registrado'}</InfoField>
        <InfoField label="Publicações hoje" className="tabular-nums">
          {site.publishedToday} de {site.effectiveDailyPublishLimit}
          {site.publishedToday >= site.effectiveDailyPublishLimit && (
            <p className="mt-1 font-normal">Limite do dia atingido.</p>
          )}
        </InfoField>
      </InfoList>
    </Card>
  );
}
