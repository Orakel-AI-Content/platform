import { contentPath } from '@orakel/core/v1';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ContentEditor } from '@/components/content-editor';
import { getDb } from '@/db/client.ts';
import { can } from '@/domain/access/rbac.ts';
import { noRead } from '@/components/forbidden-screen';
import { getEnv } from '@/env.ts';

import { noWrite } from '../../../editorial-page.tsx';
import { itemTitle } from '../../../item-title.ts';
import { updateContentAction } from '../../actions.ts';
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
 * (#110) é a da última versão salva, no host de visualização (`PREVIEW_BASE_URL`).
 */
export default async function EditContentPage({ params, searchParams }: Params & SearchParams) {
  const { site: siteId, id } = await params;
  const { criado } = await searchParams;
  const contentId = positiveInt(id);
  if (contentId === undefined) notFound();
  const read = await readContentVersions(siteId, contentId);
  if (read === undefined) return null;
  const { actor, versions } = read;
  const db = getDb().db;
  if (!versions.ok) {
    if (versions.issues.some((issue) => issue.code === 'content.not_found')) notFound();
    return noRead;
  }
  if (!can(actor, 'content.write')) {
    return noWrite(siteId);
  }
  const options = await editorOptions(db, actor, siteId);
  if (options === undefined) return noRead;
  const latest = versions.value.at(-1);
  if (latest === undefined) notFound();

  return (
    <section aria-labelledby="edit-content-title" className="form-width space-y-4">
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
        mode="edit"
        siteId={siteId}
        defaultValues={latest.data}
        options={options}
        action={updateContentAction.bind(null, siteId, contentId)}
        created={criado === '1'}
        previewUrl={`${getEnv().PREVIEW_BASE_URL}/${siteId}${contentPath(latest.data)}`}
      />
    </section>
  );
}
