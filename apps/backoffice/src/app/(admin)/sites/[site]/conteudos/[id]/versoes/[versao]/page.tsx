import Link from 'next/link';
import { notFound } from 'next/navigation';

import { currentActor } from '@/auth/request-actor.ts';
import { ContentVersionView } from '@/components/content-version-view';
import { CONTENT_STATUS_LABEL, dateTime } from '@/components/site-labels.ts';
import { Badge } from '@/components/ui/badge';
import { getDb } from '@/db/client.ts';
import { listContentVersions } from '@/domain/content/contents.ts';

import { positiveInt } from '../../../params.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Versão do conteúdo' };

/** Uma versão de um conteúdo, só para leitura: nenhum controle de edição. */
export default async function ContentVersionPage({
  params,
}: {
  params: Promise<{ site: string; id: string; versao: string }>;
}) {
  const actor = await currentActor();
  if (!actor.ok) return null;
  const { site: siteId, id, versao } = await params;
  const contentId = positiveInt(id);
  const number = positiveInt(versao);
  if (contentId === undefined || number === undefined) notFound();
  const versions = await listContentVersions(getDb().db, actor.value, siteId, contentId);
  if (!versions.ok) {
    if (versions.issues.some((issue) => issue.code === 'content.not_found')) notFound();
    return <p role="alert">Sem permissão para ver os conteúdos.</p>;
  }
  const version = versions.value.find((item) => item.version === number);
  if (version === undefined) notFound();
  const latest = versions.value.at(-1)!.version;

  return (
    <article aria-labelledby="version-title" className="max-w-3xl space-y-4">
      <p className="text-sm">
        <Link
          href={`/sites/${siteId}/conteudos/${contentId}`}
          className="underline underline-offset-4"
        >
          Todas as versões
        </Link>
      </p>
      <h1 id="version-title" className="text-2xl font-semibold">
        Versão {version.version} de “{version.data.title}”
      </h1>
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="outline">{CONTENT_STATUS_LABEL[version.status]}</Badge>
        Gravada em {dateTime.format(version.createdAt)}
        {version.version === latest ? ' · versão mais recente' : ` · mais recente: ${latest}`}
      </p>
      <ContentVersionView data={version.data} />
    </article>
  );
}
