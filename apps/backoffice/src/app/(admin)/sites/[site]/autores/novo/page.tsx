import { EntityForm } from '@/components/entity-forms';

import { editorOptions } from '../../conteudos/editor-options.ts';
import { createAuthorAction } from '../../editorial-actions.ts';
import { noWrite, PageHeader, sitePageContext } from '../../editorial-page.tsx';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Criar autor' };

export default async function NewAuthorPage({ params }: { params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  const context = await sitePageContext(siteId);
  if (!context.ok) return context.render;
  const { actor, db, site, canWrite } = context.value;
  if (!canWrite) return noWrite;
  const options = await editorOptions(db, actor, site.id);

  return (
    <section aria-labelledby="new-author-title" className="max-w-3xl space-y-4">
      <PageHeader
        id="new-author-title"
        back={{ href: `/sites/${site.id}/autores`, label: `Autores de ${site.id}` }}
        title="Criar autor"
      />
      <EntityForm
        kind="author"
        mode="create"
        siteId={site.id}
        defaultValues={{ slug: '', name: '' }}
        media={options?.media ?? []}
        action={createAuthorAction.bind(null, site.id)}
      />
    </section>
  );
}
