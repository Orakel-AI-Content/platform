import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { EntityForm } from '@/components/entity-forms';
import { can } from '@/domain/access/rbac.ts';
import { noRead } from '@/components/shared/ForbiddenScreen';
import { PageHeader } from '@/components/shared/PageHeader';
import { siteTrail } from '@/components/shared/trail.ts';
import { withoutId } from '@/components/shared/withoutId.ts';

import { positiveInt } from '../../conteudos/params.ts';
import { updateMenuAction } from '../../editorial-actions.ts';
import { lookupSite, noWrite, readMenus, sitePageContext } from '../../editorial-page.tsx';
import { itemTitle } from '../../item-title.ts';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ site: string; id: string }> };

/** "<chave> · Editar menu", só quando a página mostraria o formulário (#79). */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { site: siteId, id } = await params;
  const menuId = positiveInt(id);
  const lookup = await lookupSite(siteId);
  const editable =
    menuId !== undefined && lookup.kind === 'found' && can(lookup.actor, 'content.write');
  const menus = editable ? await readMenus(siteId) : undefined;
  const menu = menus?.ok ? menus.value.find((item) => item.id === menuId) : undefined;
  return { title: itemTitle(menu?.key, 'Editar menu') };
}

export default async function EditMenuPage({ params }: Params) {
  const { site: siteId, id } = await params;
  const menuId = positiveInt(id);
  if (menuId === undefined) notFound();
  const context = await sitePageContext(siteId);
  if (!context.ok) return context.render;
  const { site, canWrite } = context.value;
  if (!canWrite) return noWrite(site.id);
  const menus = await readMenus(site.id);
  if (!menus?.ok) return noRead;
  const menu = menus.value.find((item) => item.id === menuId);
  if (menu === undefined) notFound();

  return (
    <section aria-labelledby="edit-menu-title" className="form-width space-y-4">
      <PageHeader
        id="edit-menu-title"
        trail={siteTrail(site, { label: 'Menus', segment: 'menus' }, [{ label: menu.key }])}
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
