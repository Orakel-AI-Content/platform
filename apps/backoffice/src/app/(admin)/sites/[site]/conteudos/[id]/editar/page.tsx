import Link from 'next/link';
import { notFound } from 'next/navigation';

import { currentActor } from '@/auth/request-actor.ts';
import { ContentEditor } from '@/components/content-editor';
import { getDb } from '@/db/client.ts';
import { can } from '@/domain/access/rbac.ts';
import { listContentVersions } from '@/domain/content/contents.ts';

import { updateContentAction } from '../../actions.ts';
import { editorOptions } from '../../editor-options.ts';
import { positiveInt } from '../../params.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Editar conteúdo · Orakel Backoffice' };

/**
 * Edição: parte da versão mais recente e grava a N+1 em rascunho. Sem content.write não há
 * editor (e o domínio recusa).
 */
export default async function EditContentPage({
  params,
}: {
  params: Promise<{ site: string; id: string }>;
}) {
  const actor = await currentActor();
  if (!actor.ok) return null;
  const { site: siteId, id } = await params;
  const contentId = positiveInt(id);
  if (contentId === undefined) notFound();
  const db = getDb().db;
  const versions = await listContentVersions(db, actor.value, siteId, contentId);
  if (!versions.ok) {
    if (versions.issues.some((issue) => issue.code === 'content.not_found')) notFound();
    return <p role="alert">Sem permissão para ver os conteúdos.</p>;
  }
  if (!can(actor.value, 'content.write')) {
    return <p role="alert">Sem permissão para editar conteúdos.</p>;
  }
  const options = await editorOptions(db, actor.value, siteId);
  if (options === undefined) return <p role="alert">Sem permissão para ver os conteúdos.</p>;
  const latest = versions.value.at(-1);
  if (latest === undefined) notFound();

  return (
    <section aria-labelledby="edit-content-title" className="max-w-3xl space-y-4">
      <p className="text-sm">
        <Link
          href={`/sites/${siteId}/conteudos/${contentId}`}
          className="underline underline-offset-4"
        >
          Versões do conteúdo
        </Link>
      </p>
      <h1 id="edit-content-title" className="text-2xl font-semibold">
        Editar “{latest.data.title}”
      </h1>
      <p className="text-sm text-muted-foreground">
        Partindo da versão {latest.version}; salvar grava a versão {latest.version + 1} em rascunho.
      </p>
      <ContentEditor
        key={latest.version}
        mode="edit"
        siteId={siteId}
        defaultValues={latest.data}
        options={options}
        action={updateContentAction.bind(null, siteId, contentId)}
      />
    </section>
  );
}
