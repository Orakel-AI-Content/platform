import AudienceHeader from '@/components/audience/AudienceHeader';
import AudienceMetrics from '@/components/audience/AudienceMetrics';
import { AudienceTable } from '@/components/audience/AudienceTable';
import AdaptiveCard from '@/components/shared/AdaptiveCard';
import { EmptyState } from '@/components/shared/EmptyState';
import { noRead } from '@/components/shared/ForbiddenScreen';
import { PageTrail } from '@/components/shared/PageHeader';
import { siteTrail } from '@/components/shared/trail.ts';
import { parseAudiencePeriod, readSiteAudience } from '@/domain/audience/read.ts';

import { sitePageContext } from '../editorial-page.tsx';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Audiência' };

type SearchParams = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Audiência do site (#548): totais e tabela por dia de São Paulo, lidos das tabelas diárias
 * consolidadas. O período vem de `?periodo=` (7 ou 30 dias; outro valor, 7). No padrão do
 * `AnalyticDashboard` do template: cabeçalho com o seletor, cartões (`Metrics`) e a tabela.
 * Sem linhas no período, o estado vazio no lugar dos cartões e da tabela.
 */
export default async function AudiencePage({
  params,
  searchParams,
}: { params: Promise<{ site: string }> } & SearchParams) {
  const { site: siteId } = await params;
  const period = parseAudiencePeriod((await searchParams).periodo);
  const context = await sitePageContext(siteId);
  if (!context.ok) return context.render;
  const { actor, db, site } = context.value;
  const audience = await readSiteAudience(db, actor, site.id, { period });
  if (!audience.ok) return noRead;
  const { totals, days } = audience.value;

  return (
    <section aria-labelledby="audience-title" className="list-width space-y-4">
      <PageTrail items={siteTrail(site, 'Audiência')} />
      <AudienceHeader titleId="audience-title" selectedPeriod={period} />
      {days.length === 0 ? (
        <EmptyState>Nenhuma visualização consolidada nos últimos {period} dias.</EmptyState>
      ) : (
        <>
          <AudienceMetrics totals={totals} selectedPeriod={period} />
          <AdaptiveCard>
            <AudienceTable rows={days} />
          </AdaptiveCard>
        </>
      )}
    </section>
  );
}
