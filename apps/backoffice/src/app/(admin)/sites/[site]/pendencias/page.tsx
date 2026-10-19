import { noRead } from '@/components/shared/ForbiddenScreen';
import { PendingChangesTable } from '@/components/sites/PendingChangesTable';
import { listPendingChanges } from '@/domain/pending-changes/list.ts';

import { PageHeader, siteTrail, sitePageContext } from '../editorial-page.tsx';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Mudanças pendentes' };

/**
 * Mudanças do site ainda não publicadas (#99), só leitura: o destino do número de pendências
 * da lista de sites. Ler exige site.read (o domínio confere).
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
      <PageHeader
        id="pending-title"
        trail={siteTrail(site, 'Mudanças pendentes')}
        title="Mudanças pendentes"
      />
      <PendingChangesTable siteId={site.id} timeZone={site.timeZone} rows={changes.value} />
    </section>
  );
}
