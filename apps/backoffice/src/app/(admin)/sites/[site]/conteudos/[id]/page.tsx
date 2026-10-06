import Link from 'next/link';
import { notFound } from 'next/navigation';

import { currentActor } from '@/auth/request-actor.ts';
import { ContentVersionsTable } from '@/components/content-versions-table';
import { CONTENT_KIND_LABEL } from '@/components/site-labels.ts';
import { getDb } from '@/db/client.ts';
import { listContentVersions } from '@/domain/content/contents.ts';

import { positiveInt } from '../params.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Versões do conteúdo · Orakel Backoffice' };

/** Versões de um conteúdo, da primeira à mais recente; cada uma abre só para leitura. */
export default async function ContentVersionsPage({
  params,
}: {
  params: Promise<{ site: string; id: string }>;
}) {
  const actor = await currentActor();
  if (!actor.ok) return null;
  const { site: siteId, id } = await params;
  const contentId = positiveInt(id);
  if (contentId === undefined) notFound();
  const versions = await listContentVersions(getDb().db, actor.value, siteId, contentId);
  if (!versions.ok) {
    if (versions.issues.some((issue) => issue.code === 'content.not_found')) notFound();
    return <p role="alert">Sem permissão para ver os conteúdos.</p>;
  }
  const latest = versions.value.at(-1)!;

  return (
    <section aria-labelledby="versions-title" className="space-y-4">
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
      <ContentVersionsTable
        siteId={siteId}
        contentId={contentId}
        rows={versions.value.map((version) => ({
          version: version.version,
          status: version.status,
          title: version.data.title,
          createdAt: version.createdAt,
        }))}
      />
    </section>
  );
}
