import { EntityTable } from '@/components/entity-table';
import { listAuthors } from '@/domain/content/authors.ts';

import { PageHeader, sitePageContext } from '../editorial-page.tsx';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Autores · Orakel Backoffice' };

/** Autores do site; criar e editar só com content.write. */
export default async function AuthorsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  const context = await sitePageContext(siteId);
  if (!context.ok) return context.render;
  const { actor, db, site, canWrite } = context.value;
  const authors = await listAuthors(db, actor, site.id);
  if (!authors.ok) return <p role="alert">Sem permissão para ver os autores.</p>;

  return (
    <section aria-labelledby="authors-title" className="space-y-4">
      <PageHeader
        id="authors-title"
        back={{ href: `/sites/${site.id}`, label: site.name }}
        title={`Autores (${site.id})`}
      />
      <EntityTable
        basePath={`/sites/${site.id}/autores`}
        headers={['Nome', 'Slug', 'Área de atuação']}
        rows={authors.value.map((author) => ({
          id: author.id,
          name: author.name,
          cells: [author.slug, author.expertise ?? '—'],
        }))}
        noun={{ one: 'autor', many: 'autores', none: 'Nenhum autor cadastrado.' }}
        createLabel="Criar autor"
        canWrite={canWrite}
      />
    </section>
  );
}
