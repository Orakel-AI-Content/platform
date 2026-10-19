import { contentPath } from '@orakel/core/v1';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { noRead } from '@/components/shared/ForbiddenScreen';
import { ReviewPanel } from '@/components/review-panel';
import { can } from '@/domain/access/rbac.ts';
import { REVIEW_CHECKLIST, reviewIssues } from '@/domain/reviews/reviews.ts';
import { getEnv } from '@/env.ts';

import { itemTitle } from '../../item-title.ts';
import { readContentVersions } from '../../conteudos/content-versions.ts';
import { positiveInt } from '../../conteudos/params.ts';
import { PageHeader, sitePageContext, siteTrail } from '../../editorial-page.tsx';
import { approveAction } from '../actions.ts';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ site: string; id: string }> };

/** "<título> · Revisão"; sem o conteúdo, só a área. */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { site: siteId, id } = await params;
  const contentId = positiveInt(id);
  const read = contentId === undefined ? undefined : await readContentVersions(siteId, contentId);
  const latest = read?.versions.ok ? read.versions.value.at(-1) : undefined;
  return { title: itemTitle(latest?.data.title, 'Revisão') };
}

/**
 * Tela de revisão (#75): a versão mais recente na visualização do site (iframe) e, ao lado, os
 * erros de validação da release, o checklist e a aprovação. Ler exige site.read; aprovar só
 * aparece com content.publish, e o domínio confere tudo de novo.
 */
export default async function ReviewPage({ params }: Params) {
  const { site: siteId, id } = await params;
  const contentId = positiveInt(id);
  if (contentId === undefined) notFound();
  const context = await sitePageContext(siteId);
  if (!context.ok) return context.render;
  const { actor, db, site } = context.value;

  // A mesma leitura do título da aba (`cache`): as versões não são buscadas duas vezes.
  const read = await readContentVersions(siteId, contentId);
  if (read === undefined) return null;
  const { versions } = read;
  if (!versions.ok) {
    if (versions.issues.some((issue) => issue.code === 'content.not_found')) notFound();
    return noRead;
  }
  const validation = await reviewIssues(db, actor, siteId, contentId);
  if (!validation.ok) return noRead;
  const latest = versions.value.at(-1)!;
  const previewUrl = `${getEnv().PREVIEW_BASE_URL}/${site.id}${contentPath(latest.data)}`;

  return (
    <section aria-labelledby="review-title" className="list-width space-y-4">
      <PageHeader
        id="review-title"
        trail={siteTrail(site, { label: 'Revisão', segment: 'revisao' }, [
          { label: latest.data.title },
        ])}
        title={<>Revisão de “{latest.data.title}”</>}
      />
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Versão {latest.version} · /{latest.data.slug}
      </p>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <iframe
          src={previewUrl}
          title={`Visualização de “${latest.data.title}” no site`}
          className="h-[75vh] w-full rounded-md border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
        />
        <ReviewPanel
          version={latest.version}
          status={latest.status}
          issues={validation.value.issues.map(({ message }) => ({ message }))}
          checklist={REVIEW_CHECKLIST.map(({ key, label }) => ({ key, label }))}
          canApprove={can(actor, 'content.publish')}
          previewUrl={previewUrl}
          approve={approveAction.bind(null, site.id, contentId, latest.version)}
        />
      </div>
    </section>
  );
}
