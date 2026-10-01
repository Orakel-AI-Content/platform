import { currentActor } from '../../../auth/request-actor.ts';
import { getDb } from '../../../db/client.ts';
import { can } from '../../../domain/access/rbac.ts';
import { listSites } from '../../../domain/sites/sites.ts';
import { publishNow } from './actions.ts';
import { SitesTable } from '@/components/sites-table';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Sites · Orakel Backoffice' };

/** Registro de instâncias: um site por linha, com estado, release e mudanças pendentes. */
export default async function SitesPage() {
  const actor = await currentActor();
  if (!actor.ok) return null;
  const sites = await listSites(getDb().db, actor.value);
  if (!sites.ok) {
    return <p role="alert">Sem permissão para ver os sites.</p>;
  }
  return (
    <section aria-labelledby="sites-title" className="space-y-4">
      <h1 id="sites-title" className="text-2xl font-semibold">
        Sites
      </h1>
      <SitesTable
        rows={sites.value}
        publishNow={can(actor.value, 'operations.run') ? publishNow : undefined}
      />
    </section>
  );
}
