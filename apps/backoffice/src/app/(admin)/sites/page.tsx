import Link from 'next/link';

import { currentActor } from '@/auth/request-actor.ts';
import { noRead } from '@/components/forbidden-screen';
import { SitesTable } from '@/components/sites-table';
import { buttonVariants } from '@/components/legacy-ui/button';
import { can } from '@/domain/access/rbac.ts';
import { TFVARS_FILENAME } from '@/domain/sites/sites.ts';

import { PageHeader } from './[site]/editorial-page.tsx';
import { publishNow } from './actions.ts';
import { readVisibleSites } from '../visible-sites.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Sites' };

type SearchParams = { searchParams: Promise<{ cadastrado?: string | string[] }> };

/**
 * Registro de instâncias: um site por linha, com estado, release e mudanças pendentes.
 * `?cadastrado=<id>` vem do cadastro: a tabela anuncia a confirmação no topo.
 */
export default async function SitesPage({ searchParams }: SearchParams) {
  const { cadastrado } = await searchParams;
  const actor = await currentActor();
  if (!actor.ok) return null;
  const sites = await readVisibleSites();
  if (!sites?.ok) {
    return noRead;
  }
  const canConfigure = can(actor.value, 'site.configure');
  const register = canConfigure ? (
    <Link href="/sites/novo" className={buttonVariants({ size: 'sm' })}>
      Cadastrar site
    </Link>
  ) : undefined;
  return (
    <section aria-labelledby="sites-title" className="list-width space-y-4">
      <PageHeader
        id="sites-title"
        title="Sites"
        action={
          canConfigure ? (
            <>
              {register}
              {/* Rota de download (ADR 0011), não navegação: <a> com download, não <Link>. */}
              <a
                href="/sites/tfvars"
                download={TFVARS_FILENAME}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Baixar {TFVARS_FILENAME}
              </a>
            </>
          ) : undefined
        }
      />
      <SitesTable
        rows={sites.value}
        publishNow={can(actor.value, 'operations.run') ? publishNow : undefined}
        canConfigure={canConfigure}
        emptyAction={register}
        created={typeof cadastrado === 'string' ? cadastrado : undefined}
      />
    </section>
  );
}
