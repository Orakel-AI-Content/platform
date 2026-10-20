import { ContentEditor } from '@/components/contents/ContentEditor';
import { noRead } from '@/components/shared/ForbiddenScreen';
import { PageHeader } from '@/components/shared/PageHeader';
import { siteTrail } from '@/components/shared/trail.ts';

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
    return noWrite(site);
  }
  const options = await editorOptions(db, actor, siteId);
  if (options === undefined) return noRead;

  return (
    <section aria-labelledby="new-content-title" className="space-y-4">
      {/* A largura fica na coluna do formulário: a barra de ações encosta nas bordas do main. */}
      <div className="form-width">
        <PageHeader
          id="new-content-title"
          trail={siteTrail(site, { label: 'Conteúdos', segment: 'conteudos' }, [
            { label: 'Criar conteúdo' },
          ])}
          title="Criar conteúdo"
        />
      </div>
      <ContentEditor
        mode="create"
        siteId={site.id}
        backHref={`/sites/${site.id}/conteudos`}
        contentClassName="form-width"
        timeZone={site.timeZone}
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
