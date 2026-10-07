import { EntityForm } from '@/components/entity-forms';

import { createTaxonomyAction } from '../../editorial-actions.ts';
import { noWrite, PageHeader, sitePageContext } from '../../editorial-page.tsx';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Criar taxonomia' };

export default async function NewTaxonomyPage({ params }: { params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  const context = await sitePageContext(siteId);
  if (!context.ok) return context.render;
  const { site, canWrite } = context.value;
  if (!canWrite) return noWrite(site.id);

  return (
    <section aria-labelledby="new-taxonomy-title" className="form-width space-y-4">
      <PageHeader
        id="new-taxonomy-title"
        back={{ href: `/sites/${site.id}/taxonomias`, label: `Taxonomias de ${site.id}` }}
        title="Criar taxonomia"
      />
      <EntityForm
        kind="taxonomy"
        mode="create"
        siteId={site.id}
        defaultValues={{ kind: 'category', slug: '', name: '' }}
        action={createTaxonomyAction.bind(null, site.id)}
      />
    </section>
  );
}
