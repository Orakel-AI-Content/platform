import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ContentEditor } from '@/components/contents/ContentEditor';
import { ReturnNotice } from '@/components/review/ReturnNotice';
import { getDb } from '@/db/client.ts';
import { can } from '@/domain/access/rbac.ts';
import { pendingReturn } from '@/domain/reviews/reviews.ts';
import { noRead } from '@/components/shared/ForbiddenScreen';
import { PageHeader } from '@/components/shared/PageHeader';
import { PageMeta } from '@/components/shared/PageMeta';
import { siteTrail } from '@/components/shared/trail.ts';

import { noWrite } from '../../../editorial-page.tsx';
import { itemTitle } from '../../../item-title.ts';
import { updateAndSubmitContentAction, updateContentAction } from '../../actions.ts';
import { previewUrl } from '../../content-urls.ts';
import { readContentVersions } from '../../content-versions.ts';
import { editorOptions } from '../../editor-options.ts';
import { positiveInt } from '../../params.ts';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ site: string; id: string }> };
type SearchParams = { searchParams: Promise<{ criado?: string | string[] }> };

/** "<título> · Editar conteúdo", só quando a página mostraria o editor (#79). */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { site: siteId, id } = await params;
  const contentId = positiveInt(id);
  const read = contentId === undefined ? undefined : await readContentVersions(siteId, contentId);
  const latest =
    read?.versions.ok && can(read.actor, 'content.write') ? read.versions.value.at(-1) : undefined;
  return { title: itemTitle(latest?.data.title, 'Editar conteúdo') };
}

/**
 * Edição: parte da versão mais recente e grava a N+1 em rascunho. Sem content.write não há
 * editor (e o domínio recusa). Sem `key` pela versão: depois de salvar, o editor recomeça da
 * versão salva (`reset`) e o `router.refresh` só atualiza o cabeçalho, sem remontar e perder a
 * confirmação (#109). `?criado=1` vem da criação: o editor anuncia "Conteúdo criado.". A prévia
 * (#110) é a da última versão salva, no host de visualização (`PREVIEW_BASE_URL`). Com uma
 * devolução pendente (#598), o comentário do revisor fica acima do editor.
 */
export default async function EditContentPage({ params, searchParams }: Params & SearchParams) {
  const { site: siteId, id } = await params;
  const { criado } = await searchParams;
  const contentId = positiveInt(id);
  if (contentId === undefined) notFound();
  const read = await readContentVersions(siteId, contentId);
  if (read === undefined) return null;
  const { actor, versions, site, timeZone } = read;
  const db = getDb().db;
  if (!versions.ok) {
    if (versions.issues.some((issue) => issue.code === 'content.not_found')) notFound();
    return noRead;
  }
  if (!can(actor, 'content.write')) {
    return noWrite(site);
  }
  const options = await editorOptions(db, actor, siteId);
  if (options === undefined) return noRead;
  const latest = versions.value.at(-1);
  if (latest === undefined) notFound();
  const returned = await pendingReturn(db, actor, siteId, contentId);
  // "Voltar" vai ao nível anterior da trilha: o conteúdo.
  const back = `/sites/${siteId}/conteudos/${contentId}`;

  return (
    <section aria-labelledby="edit-content-title" className="space-y-4">
      {/* Largura na coluna (barra nas bordas do main); duas colunas a partir de `xl` (#591). */}
      <div className="list-width space-y-4">
        <PageHeader
          id="edit-content-title"
          trail={siteTrail(site, { label: 'Conteúdos', segment: 'conteudos' }, [
            { label: latest.data.title, href: back },
            { label: 'Editar' },
          ])}
          title={<>Editar “{latest.data.title}”</>}
        />
        <PageMeta
          items={[
            `Partindo da versão ${latest.version}`,
            `Salvar grava a versão ${latest.version + 1} em rascunho`,
          ]}
        />
        {returned.ok && returned.value !== null && (
          <ReturnNotice pending={returned.value} timeZone={timeZone} />
        )}
      </div>
      <ContentEditor
        mode="edit"
        siteId={siteId}
        backHref={back}
        contentClassName="list-width"
        timeZone={timeZone}
        defaultValues={latest.data}
        options={options}
        action={updateContentAction.bind(null, siteId, contentId)}
        submitAction={updateAndSubmitContentAction.bind(null, siteId, contentId)}
        created={criado === '1'}
        previewUrl={previewUrl(siteId, latest.data)}
      />
    </section>
  );
}
