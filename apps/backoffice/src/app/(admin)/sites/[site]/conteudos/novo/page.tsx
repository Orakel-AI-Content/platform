import Link from 'next/link';

import { ContentEditor } from '@/components/content-editor';
import { noRead } from '@/components/forbidden-screen';

import { noWrite, sitePageContext } from '../../editorial-page.tsx';
import { createContentAction } from '../actions.ts';
import { editorOptions } from '../editor-options.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Criar conteúdo' };

/** Criação de artigo ou página. Sem content.write não há editor (e o domínio recusa). */
export default async function NewContentPage({ params }: { params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  const context = await sitePageContext(siteId);
  if (!context.ok) return context.render;
  const { actor, db, site, canWrite } = context.value;
  if (!canWrite) {
    return noWrite(site.id);
  }
  const options = await editorOptions(db, actor, siteId);
  if (options === undefined) return noRead;

  return (
    <section aria-labelledby="new-content-title" className="form-width space-y-4">
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
