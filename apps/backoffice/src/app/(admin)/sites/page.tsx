import { currentActor } from '@/auth/request-actor.ts';
import { noRead } from '@/components/shared/ForbiddenScreen';
import { SitesTable } from '@/components/sites-table';
import { Button } from '@/components/ui/Button';
import ButtonLink from '@/components/ui/Button/ButtonLink';
import { can } from '@/domain/access/rbac.ts';
import { TFVARS_FILENAME } from '@/domain/sites/sites.ts';
import { PageHeader } from '@/components/shared/PageHeader';

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
    <ButtonLink href="/sites/novo" variant="solid" size="sm">
      Cadastrar site
    </ButtonLink>
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
              <Button asElement="a" href="/sites/tfvars" download={TFVARS_FILENAME} size="sm">
                Baixar {TFVARS_FILENAME}
              </Button>
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
