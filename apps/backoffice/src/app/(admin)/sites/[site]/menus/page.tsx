import { EntityTable } from '@/components/entity-table';
import { listMenus } from '@/domain/content/menus.ts';
import { noRead } from '@/components/forbidden-screen';

import { PageHeader, sitePageContext } from '../editorial-page.tsx';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Menus' };

/** Menus do site com os itens (rótulo e link); criar e editar só com content.write. */
export default async function MenusPage({ params }: { params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  const context = await sitePageContext(siteId);
  if (!context.ok) return context.render;
  const { actor, db, site, canWrite } = context.value;
  const menus = await listMenus(db, actor, site.id);
  if (!menus.ok) return noRead;

  return (
    <section aria-labelledby="menus-title" className="list-width space-y-4">
      <PageHeader
        id="menus-title"
        back={{ href: `/sites/${site.id}`, label: site.name }}
        title={`Menus (${site.id})`}
      />
      <EntityTable
        basePath={`/sites/${site.id}/menus`}
        headers={['Chave', 'Itens']}
        rows={menus.value.map((menu) => ({
          id: menu.id,
          name: menu.key,
          cells: [menu.items.map((item) => `${item.label} (${item.href})`).join(' · ')],
        }))}
        noun={{ one: 'menu', many: 'menus', none: 'Nenhum menu cadastrado.' }}
        createLabel="Criar menu"
        canWrite={canWrite}
      />
    </section>
  );
}
