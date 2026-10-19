import { EntityForm } from '@/components/editorial/EntityForms';

import { mediaSource } from '../../conteudos/editor-options.ts';
import { createAuthorAction } from '../../editorial-actions.ts';
import { noWrite, PageHeader, sitePageContext, siteTrail } from '../../editorial-page.tsx';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Criar autor' };

export default async function NewAuthorPage({ params }: { params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  const context = await sitePageContext(siteId);
  if (!context.ok) return context.render;
  const { site, canWrite } = context.value;
  if (!canWrite) return noWrite(site.id);

  return (
    <section aria-labelledby="new-author-title" className="form-width space-y-4">
      <PageHeader
        id="new-author-title"
        trail={siteTrail(site, { label: 'Autores', segment: 'autores' }, [
          { label: 'Criar autor' },
        ])}
        title="Criar autor"
      />
      <EntityForm
        kind="author"
        mode="create"
        siteId={site.id}
        defaultValues={{ slug: '', name: '' }}
        media={mediaSource(site.id)}
        action={createAuthorAction.bind(null, site.id)}
      />
    </section>
  );
}
