import Link from 'next/link';
import { notFound } from 'next/navigation';

import { currentActor } from '@/auth/request-actor.ts';
import { ContentEditor } from '@/components/content-editor';
import { getDb } from '@/db/client.ts';
import { can } from '@/domain/access/rbac.ts';
import { listSites } from '@/domain/sites/sites.ts';

import { createContentAction } from '../actions.ts';
import { editorOptions } from '../editor-options.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Criar conteúdo · Orakel Backoffice' };

/** Criação de artigo ou página. Sem content.write não há editor (e o domínio recusa). */
export default async function NewContentPage({ params }: { params: Promise<{ site: string }> }) {
  const actor = await currentActor();
  if (!actor.ok) return null;
  const { site: siteId } = await params;
  const db = getDb().db;
  const sites = await listSites(db, actor.value);
  if (!sites.ok) return <p role="alert">Sem permissão para ver os sites.</p>;
  const site = sites.value.find((summary) => summary.id === siteId);
  if (site === undefined) notFound();
  if (!can(actor.value, 'content.write')) {
    return <p role="alert">Sem permissão para criar conteúdos.</p>;
  }
  const options = await editorOptions(db, actor.value, siteId);
  if (options === undefined) return <p role="alert">Sem permissão para ver os conteúdos.</p>;

  return (
    <section aria-labelledby="new-content-title" className="max-w-3xl space-y-4">
      <p className="text-sm">
        <Link href={`/sites/${site.id}/conteudos`} className="underline underline-offset-4">
          Conteúdos de {site.id}
        </Link>
      </p>
      <h1 id="new-content-title" className="text-2xl font-semibold">
        Criar conteúdo
      </h1>
      <ContentEditor
        mode="create"
        siteId={site.id}
        defaultValues={{
          kind: 'article',
          slug: '',
          title: '',
          authorIds: [],
          taxonomyIds: [],
          publishedAt: new Date().toISOString(),
          blocks: [],
        }}
        options={options}
        action={createContentAction.bind(null, site.id)}
      />
    </section>
  );
}
