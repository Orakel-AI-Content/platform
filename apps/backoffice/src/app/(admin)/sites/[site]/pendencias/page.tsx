import AdaptiveCard from '@/components/shared/AdaptiveCard';
import { noRead } from '@/components/shared/ForbiddenScreen';
import { ListHeader, PageTrail } from '@/components/shared/PageHeader';
import { siteTrail } from '@/components/shared/trail.ts';
import { PendingChangesTable } from '@/components/sites/PendingChangesTable';
import { listPendingChanges } from '@/domain/pending-changes/list.ts';

import { sitePageContext } from '../editorial-page.tsx';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Mudanças pendentes' };

/**
 * Mudanças do site ainda não publicadas (#99), só leitura: o destino do número de pendências
 * da lista de sites. Ler exige site.read (o domínio confere). Lista no padrão do template
 * (#365): a trilha acima do cartão; título, toolbar e tabela dentro dele.
 */
export default async function PendingChangesPage({
  params,
}: {
  params: Promise<{ site: string }>;
}) {
  const { site: siteId } = await params;
  const context = await sitePageContext(siteId);
  if (!context.ok) return context.render;
  const { actor, db, site } = context.value;
  const changes = await listPendingChanges(db, actor, site.id);
  if (!changes.ok) return noRead;

  return (
    <section aria-labelledby="pending-title" className="list-width space-y-4">
      <PageTrail items={siteTrail(site, 'Mudanças pendentes')} />
      <AdaptiveCard>
        <div className="flex flex-col gap-4">
          <ListHeader id="pending-title" title="Mudanças pendentes" />
          <PendingChangesTable
            siteId={site.id}
            timeZone={site.timeZone}
            rows={changes.value}
            labelledBy="pending-title"
          />
        </div>
      </AdaptiveCard>
    </section>
  );
}
