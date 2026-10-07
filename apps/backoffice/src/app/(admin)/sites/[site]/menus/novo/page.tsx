import { EntityForm } from '@/components/entity-forms';

import { createMenuAction } from '../../editorial-actions.ts';
import { noWrite, PageHeader, sitePageContext } from '../../editorial-page.tsx';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Criar menu' };

export default async function NewMenuPage({ params }: { params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  const context = await sitePageContext(siteId);
  if (!context.ok) return context.render;
  const { site, canWrite } = context.value;
  if (!canWrite) return noWrite;

  return (
    <section aria-labelledby="new-menu-title" className="max-w-3xl space-y-4">
      <PageHeader
        id="new-menu-title"
        back={{ href: `/sites/${site.id}/menus`, label: `Menus de ${site.id}` }}
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
