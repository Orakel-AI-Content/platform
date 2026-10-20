import { ReviewQueueTable } from '@/components/review/ReviewQueueTable';
import AdaptiveCard from '@/components/shared/AdaptiveCard';
import { noRead } from '@/components/shared/ForbiddenScreen';
import { ListHeader, PageTrail } from '@/components/shared/PageHeader';
import { siteTrail } from '@/components/shared/trail.ts';
import { listReviewQueue } from '@/domain/content/contents.ts';

import { sitePageContext } from '../editorial-page.tsx';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Revisão' };

/**
 * Fila de revisão do site (#74): conteúdos cuja versão mais recente está em revisão. Ler
 * exige site.read (o domínio confere); aprovar é da tela de revisão de cada conteúdo. Lista no
 * padrão do template (#365): a trilha acima do cartão; título, toolbar e tabela dentro dele.
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
      <PageTrail items={siteTrail(site, 'Revisão')} />
      <AdaptiveCard>
        <div className="flex flex-col gap-4">
          <ListHeader id="review-queue-title" title="Revisão" />
          <ReviewQueueTable
            siteId={site.id}
            timeZone={site.timeZone}
            rows={queue.value}
            labelledBy="review-queue-title"
          />
        </div>
      </AdaptiveCard>
    </section>
  );
}
