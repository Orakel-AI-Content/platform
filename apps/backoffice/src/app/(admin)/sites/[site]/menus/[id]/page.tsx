import { notFound } from 'next/navigation';

import { EntityForm } from '@/components/entity-forms';
import { listMenus } from '@/domain/content/menus.ts';

import { positiveInt } from '../../conteudos/params.ts';
import { updateMenuAction } from '../../editorial-actions.ts';
import { noWrite, PageHeader, sitePageContext, withoutId } from '../../editorial-page.tsx';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Editar menu' };

export default async function EditMenuPage({
  params,
}: {
  params: Promise<{ site: string; id: string }>;
}) {
  const { site: siteId, id } = await params;
  const menuId = positiveInt(id);
  if (menuId === undefined) notFound();
  const context = await sitePageContext(siteId);
  if (!context.ok) return context.render;
  const { actor, db, site, canWrite } = context.value;
  if (!canWrite) return noWrite;
  const menus = await listMenus(db, actor, site.id);
  if (!menus.ok) return <p role="alert">Sem permissão para ver os menus.</p>;
  const menu = menus.value.find((item) => item.id === menuId);
  if (menu === undefined) notFound();

  return (
    <section aria-labelledby="edit-menu-title" className="max-w-3xl space-y-4">
      <PageHeader
        id="edit-menu-title"
        back={{ href: `/sites/${site.id}/menus`, label: `Menus de ${site.id}` }}
        title={`Editar “${menu.key}”`}
      />
      <EntityForm
        kind="menu"
        mode="edit"
        siteId={site.id}
        defaultValues={withoutId(menu)}
        action={updateMenuAction.bind(null, site.id, menu.id)}
      />
    </section>
  );
}
