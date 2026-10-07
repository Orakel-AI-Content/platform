import { MediaLibrary } from '@/components/media-library';
import { listMedia } from '@/domain/content/media.ts';

import { PageHeader, sitePageContext } from '../editorial-page.tsx';
import { listMediaAction } from './actions.ts';
import { mediaItems } from './items.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Mídia' };

/** Biblioteca de mídia do site; enviar imagem só com content.write (a rota confere de novo). */
export default async function MediaPage({ params }: { params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  const context = await sitePageContext(siteId);
  if (!context.ok) return context.render;
  const { actor, db, site, canWrite } = context.value;
  const media = await listMedia(db, actor, site.id);
  if (!media.ok) return <p role="alert">Sem permissão para ver a mídia.</p>;

  return (
    <section aria-labelledby="media-title" className="space-y-4">
      <PageHeader
        id="media-title"
        back={{ href: `/sites/${site.id}`, label: site.name }}
        title={`Mídia (${site.id})`}
      />
      <MediaLibrary
        siteId={site.id}
        items={mediaItems(site.domain, media.value)}
        canWrite={canWrite}
        refresh={listMediaAction}
      />
    </section>
  );
}
