import { ReviewQueueTable } from '@/components/review-queue-table';
import { noRead } from '@/components/forbidden-screen';
import { listReviewQueue } from '@/domain/content/contents.ts';

import { PageHeader, siteTrail, sitePageContext } from '../editorial-page.tsx';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Revisão' };

/**
 * Fila de revisão do site (#74): conteúdos cuja versão mais recente está em revisão. Ler
 * exige site.read (o domínio confere); aprovar é da tela de revisão de cada conteúdo.
 */
export default async function ReviewQueuePage({ params }: { params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  const context = await sitePageContext(siteId);
  if (!context.ok) return context.render;
  const { actor, db, site } = context.value;
  const queue = await listReviewQueue(db, actor, siteId);
  if (!queue.ok) return noRead;

  return (
    <section aria-labelledby="review-queue-title" className="list-width space-y-4">
      <PageHeader id="review-queue-title" trail={siteTrail(site, 'Revisão')} title="Revisão" />
      <ReviewQueueTable siteId={site.id} timeZone={site.timeZone} rows={queue.value} />
    </section>
  );
}
