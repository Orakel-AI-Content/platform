import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ContentVersionView } from '@/components/content-version-view';
import {
  CONTENT_STATUS_LABEL,
  CONTENT_STATUS_VARIANT,
  formatDateTime,
} from '@/components/site-labels.ts';
import { Badge } from '@/components/legacy-ui/badge';
import { noRead } from '@/components/forbidden-screen';

import { PageHeader, siteTrail } from '../../../../editorial-page.tsx';
import { itemTitle } from '../../../../item-title.ts';
import { readContentVersions } from '../../../content-versions.ts';
import { positiveInt } from '../../../params.ts';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ site: string; id: string; versao: string }> };

/** "<título> · Versão N" (#79); sem a versão, "Versão N" (ou "Versão", com número inválido). */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { site: siteId, id, versao } = await params;
  const contentId = positiveInt(id);
  const number = positiveInt(versao);
  const area = number === undefined ? 'Versão' : `Versão ${number}`;
  if (contentId === undefined || number === undefined) return { title: area };
  const read = await readContentVersions(siteId, contentId);
  const version = read?.versions.ok
    ? read.versions.value.find((item) => item.version === number)
    : undefined;
  return { title: itemTitle(version?.data.title, area) };
}

/** Uma versão de um conteúdo, só para leitura: nenhum controle de edição. */
export default async function ContentVersionPage({ params }: Params) {
  const { site: siteId, id, versao } = await params;
  const contentId = positiveInt(id);
  const number = positiveInt(versao);
  if (contentId === undefined || number === undefined) notFound();
  const read = await readContentVersions(siteId, contentId);
  if (read === undefined) return null;
  const { versions, timeZone, site } = read;
  if (!versions.ok) {
    if (versions.issues.some((issue) => issue.code === 'content.not_found')) notFound();
    return noRead;
  }
  const version = versions.value.find((item) => item.version === number);
  if (version === undefined) notFound();
  const latestVersion = versions.value.at(-1)!;
  const latest = latestVersion.version;

  return (
    <article aria-labelledby="version-title" className="form-width space-y-4">
      <PageHeader
        id="version-title"
        trail={siteTrail(site, { label: 'Conteúdos', segment: 'conteudos' }, [
          {
            label: latestVersion.data.title,
            href: `/sites/${siteId}/conteudos/${contentId}`,
          },
          { label: `Versão ${version.version}` },
        ])}
        title={
          <>
            Versão {version.version} de “{version.data.title}”
          </>
        }
      />
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge variant={CONTENT_STATUS_VARIANT[version.status]}>
          {CONTENT_STATUS_LABEL[version.status]}
        </Badge>
        Gravada em {formatDateTime(version.createdAt, timeZone)}
        {version.version === latest ? ' · versão mais recente' : ` · mais recente: ${latest}`}
      </p>
      <ContentVersionView data={version.data} />
    </article>
  );
}
