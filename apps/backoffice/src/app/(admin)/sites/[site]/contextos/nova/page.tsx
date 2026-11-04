import { EditorialContextForm } from '@/components/generation/EditorialContextForm';
import { PageHeader } from '@/components/shared/PageHeader';
import { siteTrail } from '@/components/shared/trail.ts';
import { currentEditorialContext } from '@/domain/generation/editorial-contexts.ts';

import { createEditorialContextAction } from '../../editorial-actions.ts';
import { noWrite, sitePageContext } from '../../editorial-page.tsx';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Nova versão do contexto editorial' };

/**
 * Nova versão do contexto editorial, só com content.write: o formulário parte do texto da
 * versão atual e salvar grava a N+1 (domínio), voltando para a lista.
 */
export default async function NewEditorialContextPage({
  params,
}: {
  params: Promise<{ site: string }>;
}) {
  const { site: siteId } = await params;
  const context = await sitePageContext(siteId);
  if (!context.ok) return context.render;
  const { db, site, canWrite } = context.value;
  if (!canWrite) return noWrite(site);
  const current = await currentEditorialContext(db, site.id);

  return (
    <section aria-labelledby="new-editorial-context-title" className="space-y-4">
      {/* A largura fica na coluna do formulário: a barra de ações encosta nas bordas do main. */}
      <div className="form-width space-y-4">
        <PageHeader
          id="new-editorial-context-title"
          trail={siteTrail(site, { label: 'Contextos editoriais', segment: 'contextos' }, [
            { label: 'Nova versão' },
          ])}
          title="Nova versão do contexto editorial"
        />
      </div>
      <EditorialContextForm
        siteId={site.id}
        defaultBody={current?.body ?? ''}
        contentClassName="form-width"
        action={createEditorialContextAction.bind(null, site.id)}
      />
    </section>
  );
}
