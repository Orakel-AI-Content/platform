import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ContentVersionsTable } from '@/components/content-versions-table';
import { CONTENT_KIND_LABEL } from '@/components/site-labels.ts';
import { noRead } from '@/components/forbidden-screen';
import { SubmitForReview } from '@/components/submit-for-review';
import { can } from '@/domain/access/rbac.ts';

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
 * confere de novo).
 */
export default async function ContentVersionsPage({ params }: Params) {
  const { site: siteId, id } = await params;
  const contentId = positiveInt(id);
  if (contentId === undefined) notFound();
  const read = await readContentVersions(siteId, contentId);
  if (read === undefined) return null;
  const { actor, versions, timeZone } = read;
  if (!versions.ok) {
    if (versions.issues.some((issue) => issue.code === 'content.not_found')) notFound();
    return noRead;
  }
  const latest = versions.value.at(-1)!;
  const canWrite = can(actor, 'content.write');

  return (
    <section aria-labelledby="versions-title" className="list-width space-y-4">
      <p className="text-sm">
        <Link href={`/sites/${siteId}/conteudos`} className="underline underline-offset-4">
          Conteúdos de {siteId}
        </Link>
      </p>
      <h1 id="versions-title" className="text-2xl font-semibold">
        Versões de “{latest.data.title}”
      </h1>
      <p className="text-sm text-muted-foreground">
        {CONTENT_KIND_LABEL[latest.data.kind]} · ID {contentId} · /{latest.data.slug}
      </p>
      {canWrite && (
        <SubmitForReview
          available={latest.status === 'rascunho'}
          action={submitForReviewAction.bind(null, siteId, contentId)}
        />
      )}
      <ContentVersionsTable
        siteId={siteId}
        contentId={contentId}
        timeZone={timeZone}
        rows={versions.value.map((version) => ({
          version: version.version,
          status: version.status,
          title: version.data.title,
          createdAt: version.createdAt,
          approval: version.approval,
        }))}
      />
    </section>
  );
}
