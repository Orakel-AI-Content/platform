import Link from 'next/link';

import { EntityTable } from '@/components/entity-table';
import { listAuthors } from '@/domain/content/authors.ts';
import { noRead } from '@/components/forbidden-screen';
import { buttonVariants } from '@/components/legacy-ui/button';

import { PageHeader, siteTrail, sitePageContext } from '../editorial-page.tsx';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Autores' };

/**
 * Autores do site, com busca por nome e paginação (#108); criar e editar só com
 * content.write.
 */
export default async function AuthorsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  const context = await sitePageContext(siteId);
  if (!context.ok) return context.render;
  const { actor, db, site, canWrite } = context.value;
  const authors = await listAuthors(db, actor, site.id);
  if (!authors.ok) return noRead;

  const create = canWrite ? (
    <Link href={`/sites/${site.id}/autores/novo`} className={buttonVariants({ size: 'sm' })}>
      Criar autor
    </Link>
  ) : undefined;

  return (
    <section aria-labelledby="authors-title" className="list-width space-y-4">
      <PageHeader
        id="authors-title"
        trail={siteTrail(site, 'Autores')}
        title="Autores"
        action={create}
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
        search={{ label: 'Buscar por nome', notFound: 'Nenhum autor encontrado.' }}
        canWrite={canWrite}
        emptyAction={create}
      />
    </section>
  );
}
