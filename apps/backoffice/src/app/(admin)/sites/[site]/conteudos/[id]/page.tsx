import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ContentVersionsTable } from '@/components/contents/ContentVersionsTable';
import { CONTENT_KIND_LABEL } from '@/components/shared/siteLabels.ts';
import { noRead } from '@/components/shared/ForbiddenScreen';
import { SubmitForReview } from '@/components/contents/SubmitForReview';
import { can } from '@/domain/access/rbac.ts';
import AdaptiveCard from '@/components/shared/AdaptiveCard';
import { ListHeader, PageTrail } from '@/components/shared/PageHeader';
import { siteTrail } from '@/components/shared/trail.ts';

import { itemTitle } from '../../item-title.ts';
import { submitForReviewAction } from '../actions.ts';
import { readContentVersions } from '../content-versions.ts';
import { positiveInt } from '../params.ts';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ site: string; id: string }> };

/** "<título> · Versões" (#79); sem o conteúdo, só a área. */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { site: siteId, id } = await params;
  const contentId = positiveInt(id);
  const read = contentId === undefined ? undefined : await readContentVersions(siteId, contentId);
  const latest = read?.versions.ok ? read.versions.value.at(-1) : undefined;
  return { title: itemTitle(latest?.data.title, 'Versões') };
}

/**
 * Versões de um conteúdo, da primeira à mais recente; cada uma abre só para leitura. Enviar
 * para revisão só aparece com content.write e a versão mais recente em rascunho (o domínio
 * confere de novo). Lista no padrão do template (#366): a trilha acima do cartão; título com o
 * envio como ação, a linha do conteúdo, toolbar e tabela dentro dele.
 */
export default async function ContentVersionsPage({ params }: Params) {
  const { site: siteId, id } = await params;
  const contentId = positiveInt(id);
  if (contentId === undefined) notFound();
  const read = await readContentVersions(siteId, contentId);
  if (read === undefined) return null;
  const { actor, versions, timeZone, site } = read;
  if (!versions.ok) {
    if (versions.issues.some((issue) => issue.code === 'content.not_found')) notFound();
    return noRead;
  }
  const latest = versions.value.at(-1)!;
  const canWrite = can(actor, 'content.write');

  return (
    <section aria-labelledby="versions-title" className="list-width space-y-4">
      <PageTrail
        items={siteTrail(site, { label: 'Conteúdos', segment: 'conteudos' }, [
          { label: latest.data.title },
        ])}
      />
      <AdaptiveCard>
        <div className="flex flex-col gap-4">
          <ListHeader
            id="versions-title"
            title={<>Versões de “{latest.data.title}”</>}
            action={
              canWrite && (
                <SubmitForReview
                  available={latest.status === 'rascunho'}
                  action={submitForReviewAction.bind(null, siteId, contentId)}
                />
              )
            }
          />
          <p className="text-sm">
            {CONTENT_KIND_LABEL[latest.data.kind]} · ID {contentId} · /{latest.data.slug}
          </p>
          <ContentVersionsTable
            siteId={siteId}
            contentId={contentId}
            timeZone={timeZone}
            labelledBy="versions-title"
            rows={versions.value.map((version) => ({
              version: version.version,
              status: version.status,
              title: version.data.title,
              createdAt: version.createdAt,
              approval: version.approval,
            }))}
          />
        </div>
      </AdaptiveCard>
    </section>
  );
}
