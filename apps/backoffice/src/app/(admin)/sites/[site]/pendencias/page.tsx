import { noRead } from '@/components/forbidden-screen';
import { PendingChangesTable } from '@/components/pending-changes-table';
import { listPendingChanges } from '@/domain/pending-changes/list.ts';

import { PageHeader, sitePageContext } from '../editorial-page.tsx';

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
        back={{ href: `/sites/${site.id}`, label: site.name }}
        title={`Mudanças pendentes (${site.id})`}
      />
      <PendingChangesTable siteId={site.id} timeZone={site.timeZone} rows={changes.value} />
    </section>
  );
}
