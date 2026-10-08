import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { EntityForm } from '@/components/entity-forms';
import { can } from '@/domain/access/rbac.ts';
import { noRead } from '@/components/forbidden-screen';

import { mediaSource } from '../../conteudos/editor-options.ts';
import { positiveInt } from '../../conteudos/params.ts';
import { updateAuthorAction } from '../../editorial-actions.ts';
import {
  lookupSite,
  noWrite,
  PageHeader,
  readAuthors,
  sitePageContext,
  withoutId,
  siteTrail,
} from '../../editorial-page.tsx';
import { itemTitle } from '../../item-title.ts';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ site: string; id: string }> };

/** "<nome> · Editar autor", só quando a página mostraria o formulário (#79). */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { site: siteId, id } = await params;
  const authorId = positiveInt(id);
  const lookup = await lookupSite(siteId);
  const editable =
    authorId !== undefined && lookup.kind === 'found' && can(lookup.actor, 'content.write');
  const authors = editable ? await readAuthors(siteId) : undefined;
  const author = authors?.ok ? authors.value.find((item) => item.id === authorId) : undefined;
  return { title: itemTitle(author?.name, 'Editar autor') };
}

export default async function EditAuthorPage({ params }: Params) {
  const { site: siteId, id } = await params;
  const authorId = positiveInt(id);
  if (authorId === undefined) notFound();
  const context = await sitePageContext(siteId);
  if (!context.ok) return context.render;
  const { site, canWrite } = context.value;
  if (!canWrite) return noWrite(site.id);
  const authors = await readAuthors(site.id);
  if (!authors?.ok) return noRead;
  const author = authors.value.find((item) => item.id === authorId);
  if (author === undefined) notFound();

  return (
    <section aria-labelledby="edit-author-title" className="form-width space-y-4">
      <PageHeader
        id="edit-author-title"
        trail={siteTrail(site, { label: 'Autores', segment: 'autores' }, [{ label: author.name }])}
        title={`Editar “${author.name}”`}
      />
      <EntityForm
        kind="author"
        mode="edit"
        siteId={site.id}
        defaultValues={withoutId(author)}
        media={mediaSource(site.id)}
        action={updateAuthorAction.bind(null, site.id, author.id)}
      />
    </section>
  );
}
