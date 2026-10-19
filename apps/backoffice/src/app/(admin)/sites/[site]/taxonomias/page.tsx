import { EntityTable } from '@/components/entity-table';
import { TAXONOMY_KIND_LABEL } from '@/components/site-labels.ts';
import { listTaxonomies } from '@/domain/content/taxonomies.ts';
import { noRead } from '@/components/shared/ForbiddenScreen';
import ButtonLink from '@/components/ui/Button/ButtonLink';

import { PageHeader, siteTrail, sitePageContext } from '../editorial-page.tsx';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Taxonomias' };

/**
 * Categorias, tags e séries do site, com busca por nome e paginação (#108); criar e editar
 * só com content.write.
 */
export default async function TaxonomiesPage({ params }: { params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  const context = await sitePageContext(siteId);
  if (!context.ok) return context.render;
  const { actor, db, site, canWrite } = context.value;
  const taxonomies = await listTaxonomies(db, actor, site.id);
  if (!taxonomies.ok) return noRead;

  const create = canWrite ? (
    <ButtonLink href={`/sites/${site.id}/taxonomias/novo`} variant="solid" size="sm">
      Criar taxonomia
    </ButtonLink>
  ) : undefined;

  return (
    <section aria-labelledby="taxonomies-title" className="list-width space-y-4">
      <PageHeader
        id="taxonomies-title"
        trail={siteTrail(site, 'Taxonomias')}
        title="Taxonomias"
        action={create}
      />
      <EntityTable
        basePath={`/sites/${site.id}/taxonomias`}
        headers={['Nome', 'Tipo', 'Slug']}
        rows={taxonomies.value.map((taxonomy) => ({
          id: taxonomy.id,
          name: taxonomy.name,
          cells: [TAXONOMY_KIND_LABEL[taxonomy.kind], taxonomy.slug],
        }))}
        noun={{ one: 'taxonomia', many: 'taxonomias', none: 'Nenhuma taxonomia cadastrada.' }}
        search={{ label: 'Buscar por nome', notFound: 'Nenhuma taxonomia encontrada.' }}
        canWrite={canWrite}
        emptyAction={create}
      />
    </section>
  );
}
