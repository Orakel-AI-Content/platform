import Link from 'next/link';

import { currentActor } from '@/auth/request-actor.ts';
import { SitesTable } from '@/components/sites-table';
import { buttonVariants } from '@/components/ui/button';
import { getDb } from '@/db/client.ts';
import { can } from '@/domain/access/rbac.ts';
import { listSites, TFVARS_FILENAME } from '@/domain/sites/sites.ts';

import { publishNow } from './actions.ts';

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
  const canConfigure = can(actor.value, 'site.configure');
  return (
    <section aria-labelledby="sites-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 id="sites-title" className="text-2xl font-semibold">
          Sites
        </h1>
        {canConfigure ? (
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/sites/novo" className={buttonVariants({ size: 'sm' })}>
              Cadastrar site
            </Link>
            {/* Rota de download (ADR 0011), não navegação: <a> com download, não <Link>. */}
            <a
              href="/sites/tfvars"
              download={TFVARS_FILENAME}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Baixar {TFVARS_FILENAME}
            </a>
          </div>
        ) : null}
      </div>
      <SitesTable
        rows={sites.value}
        publishNow={can(actor.value, 'operations.run') ? publishNow : undefined}
        canConfigure={canConfigure}
      />
    </section>
  );
}
