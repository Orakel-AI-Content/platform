import { notFound } from 'next/navigation';

import { EntityForm } from '@/components/entity-forms';
import { listTaxonomies } from '@/domain/content/taxonomies.ts';

import { positiveInt } from '../../conteudos/params.ts';
import { updateTaxonomyAction } from '../../editorial-actions.ts';
import { noWrite, PageHeader, sitePageContext, withoutId } from '../../editorial-page.tsx';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Editar taxonomia' };

export default async function EditTaxonomyPage({
  params,
}: {
  params: Promise<{ site: string; id: string }>;
}) {
  const { site: siteId, id } = await params;
  const taxonomyId = positiveInt(id);
  if (taxonomyId === undefined) notFound();
  const context = await sitePageContext(siteId);
  if (!context.ok) return context.render;
  const { actor, db, site, canWrite } = context.value;
  if (!canWrite) return noWrite;
  const taxonomies = await listTaxonomies(db, actor, site.id);
  if (!taxonomies.ok) return <p role="alert">Sem permissão para ver as taxonomias.</p>;
  const taxonomy = taxonomies.value.find((item) => item.id === taxonomyId);
  if (taxonomy === undefined) notFound();

  return (
    <section aria-labelledby="edit-taxonomy-title" className="max-w-3xl space-y-4">
      <PageHeader
        id="edit-taxonomy-title"
        back={{ href: `/sites/${site.id}/taxonomias`, label: `Taxonomias de ${site.id}` }}
        title={`Editar “${taxonomy.name}”`}
      />
      <EntityForm
        kind="taxonomy"
        mode="edit"
        siteId={site.id}
        defaultValues={withoutId(taxonomy)}
        action={updateTaxonomyAction.bind(null, site.id, taxonomy.id)}
      />
    </section>
  );
}
