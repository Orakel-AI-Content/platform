import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { EntityForm } from '@/components/entity-forms';
import { can } from '@/domain/access/rbac.ts';
import { noRead } from '@/components/forbidden-screen';

import { positiveInt } from '../../conteudos/params.ts';
import { updateTaxonomyAction } from '../../editorial-actions.ts';
import {
  lookupSite,
  noWrite,
  PageHeader,
  readTaxonomies,
  sitePageContext,
  withoutId,
  siteTrail,
} from '../../editorial-page.tsx';
import { itemTitle } from '../../item-title.ts';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ site: string; id: string }> };

/** "<nome> · Editar taxonomia", só quando a página mostraria o formulário (#79). */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { site: siteId, id } = await params;
  const taxonomyId = positiveInt(id);
  const lookup = await lookupSite(siteId);
  const editable =
    taxonomyId !== undefined && lookup.kind === 'found' && can(lookup.actor, 'content.write');
  const taxonomies = editable ? await readTaxonomies(siteId) : undefined;
  const taxonomy = taxonomies?.ok
    ? taxonomies.value.find((item) => item.id === taxonomyId)
    : undefined;
  return { title: itemTitle(taxonomy?.name, 'Editar taxonomia') };
}

export default async function EditTaxonomyPage({ params }: Params) {
  const { site: siteId, id } = await params;
  const taxonomyId = positiveInt(id);
  if (taxonomyId === undefined) notFound();
  const context = await sitePageContext(siteId);
  if (!context.ok) return context.render;
  const { site, canWrite } = context.value;
  if (!canWrite) return noWrite(site.id);
  const taxonomies = await readTaxonomies(site.id);
  if (!taxonomies?.ok) return noRead;
  const taxonomy = taxonomies.value.find((item) => item.id === taxonomyId);
  if (taxonomy === undefined) notFound();

  return (
    <section aria-labelledby="edit-taxonomy-title" className="form-width space-y-4">
      <PageHeader
        id="edit-taxonomy-title"
        trail={siteTrail(site, { label: 'Taxonomias', segment: 'taxonomias' }, [
          { label: taxonomy.name },
        ])}
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
