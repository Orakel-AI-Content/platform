import { MediaLibrary } from '@/components/media-library';
import { listMedia } from '@/domain/content/media.ts';
import { noRead } from '@/components/forbidden-screen';

import { PageHeader, siteTrail, sitePageContext } from '../editorial-page.tsx';
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
  if (!media.ok) return noRead;

  return (
    <section aria-labelledby="media-title" className="list-width space-y-4">
      <PageHeader id="media-title" trail={siteTrail(site, 'Mídia')} title="Mídia" />
      <MediaLibrary
        siteId={site.id}
        items={mediaItems(site.domain, media.value)}
        canWrite={canWrite}
        refresh={listMediaAction}
      />
    </section>
  );
}
