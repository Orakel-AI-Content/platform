// Módulo sem 'use client': o servidor não pode chamar função de módulo cliente.
import { parseListState } from '@/components/shared/listQuery.ts';
import { MediaLibrary } from '@/components/media-library';
import { listMediaPage } from '@/domain/content/media.ts';
import { noRead } from '@/components/shared/ForbiddenScreen';
import { PageHeader } from '@/components/shared/PageHeader';
import { siteTrail } from '@/components/shared/trail.ts';

import { sitePageContext } from '../editorial-page.tsx';
import { listMediaPageAction, uploadStatusAction } from './actions.ts';
import { MEDIA_PAGE_SIZE, mediaItems } from './items.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Mídia' };

type SearchParams = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Biblioteca de mídia do site, paginada no servidor com busca por nome (#186): `q` e `pagina`
 * vêm da URL. Enviar imagem só com content.write (a rota confere de novo).
 */
export default async function MediaPage({
  params,
  searchParams,
}: { params: Promise<{ site: string }> } & SearchParams) {
  const { site: siteId } = await params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string') query.set(key, value);
  }
  const { search, page } = parseListState(query, { filters: [], sortable: [] });
  const context = await sitePageContext(siteId);
  if (!context.ok) return context.render;
  const { actor, db, site, canWrite } = context.value;
  const media = await listMediaPage(db, actor, site.id, {
    page,
    pageSize: MEDIA_PAGE_SIZE,
    search,
  });
  if (!media.ok) return noRead;

  return (
    <section aria-labelledby="media-title" className="list-width space-y-4">
      <PageHeader id="media-title" trail={siteTrail(site, 'Mídia')} title="Mídia" />
      <MediaLibrary
        // Busca ou página nova: a biblioteca recomeça com a página lida no servidor.
        key={`${search}|${page}`}
        siteId={site.id}
        timeZone={site.timeZone}
        items={mediaItems(site.domain, media.value.items)}
        total={media.value.total}
        page={page}
        pageSize={MEDIA_PAGE_SIZE}
        search={search}
        canWrite={canWrite}
        refresh={listMediaPageAction}
        uploadStatus={uploadStatusAction}
      />
    </section>
  );
}
