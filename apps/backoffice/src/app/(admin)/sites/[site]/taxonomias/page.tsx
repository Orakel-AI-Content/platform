import { EntityTable } from '@/components/entity-table';
import { TAXONOMY_KIND_LABEL } from '@/components/site-labels.ts';
import { listTaxonomies } from '@/domain/content/taxonomies.ts';

import { PageHeader, sitePageContext } from '../editorial-page.tsx';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Taxonomias' };

/** Categorias, tags e séries do site; criar e editar só com content.write. */
export default async function TaxonomiesPage({ params }: { params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  const context = await sitePageContext(siteId);
  if (!context.ok) return context.render;
  const { actor, db, site, canWrite } = context.value;
  const taxonomies = await listTaxonomies(db, actor, site.id);
  if (!taxonomies.ok) return <p role="alert">Sem permissão para ver as taxonomias.</p>;

  return (
    <section aria-labelledby="taxonomies-title" className="space-y-4">
      <PageHeader
        id="taxonomies-title"
        back={{ href: `/sites/${site.id}`, label: site.name }}
        title={`Taxonomias (${site.id})`}
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
        createLabel="Criar taxonomia"
        canWrite={canWrite}
      />
    </section>
  );
}
