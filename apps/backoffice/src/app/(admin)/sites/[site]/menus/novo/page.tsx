import { EntityForm } from '@/components/entity-forms';
import { PageHeader } from '@/components/shared/PageHeader';
import { siteTrail } from '@/components/shared/trail.ts';

import { createMenuAction } from '../../editorial-actions.ts';
import { noWrite, sitePageContext } from '../../editorial-page.tsx';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Criar menu' };

export default async function NewMenuPage({ params }: { params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  const context = await sitePageContext(siteId);
  if (!context.ok) return context.render;
  const { site, canWrite } = context.value;
  if (!canWrite) return noWrite(site.id);

  return (
    <section aria-labelledby="new-menu-title" className="form-width space-y-4">
      <PageHeader
        id="new-menu-title"
        trail={siteTrail(site, { label: 'Menus', segment: 'menus' }, [{ label: 'Criar menu' }])}
        title="Criar menu"
      />
      <EntityForm
        kind="menu"
        mode="create"
        siteId={site.id}
        defaultValues={{ key: '', items: [{ label: '', href: '' }] }}
        action={createMenuAction.bind(null, site.id)}
      />
    </section>
  );
}
