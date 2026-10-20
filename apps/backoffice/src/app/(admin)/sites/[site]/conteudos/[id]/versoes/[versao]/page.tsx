import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TbArrowNarrowLeft } from 'react-icons/tb';

import { ContentVersionView } from '@/components/contents/ContentVersionView';
import {
  CONTENT_STATUS_LABEL,
  CONTENT_STATUS_TAG,
  formatDateTime,
} from '@/components/shared/siteLabels.ts';
import { noRead } from '@/components/shared/ForbiddenScreen';
import { StateTag } from '@/components/sites/SiteStatus';
import { PageHeader } from '@/components/shared/PageHeader';
import { PageMeta } from '@/components/shared/PageMeta';
import { siteTrail } from '@/components/shared/trail.ts';
import ButtonLink from '@/components/ui/Button/ButtonLink';
import { can } from '@/domain/access/rbac.ts';

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

/**
 * Uma versão de um conteúdo, só para leitura: nenhum controle de edição na versão. No
 * cabeçalho, "Voltar às versões" e, com content.write, "Editar" (a edição atual), como a tela de
 * detalhe do guia (#372).
 */
export default async function ContentVersionPage({ params }: Params) {
  const { site: siteId, id, versao } = await params;
  const contentId = positiveInt(id);
  const number = positiveInt(versao);
  if (contentId === undefined || number === undefined) notFound();
  const read = await readContentVersions(siteId, contentId);
  if (read === undefined) return null;
  const { actor, versions, timeZone, site } = read;
  if (!versions.ok) {
    if (versions.issues.some((issue) => issue.code === 'content.not_found')) notFound();
    return noRead;
  }
  const version = versions.value.find((item) => item.version === number);
  if (version === undefined) notFound();
  const latestVersion = versions.value.at(-1)!;
  const latest = latestVersion.version;
  const contentHref = `/sites/${siteId}/conteudos/${contentId}`;

  return (
    <article aria-labelledby="version-title" className="form-width space-y-4">
      <PageHeader
        id="version-title"
        trail={siteTrail(site, { label: 'Conteúdos', segment: 'conteudos' }, [
          {
            label: latestVersion.data.title,
            href: contentHref,
          },
          { label: `Versão ${version.version}` },
        ])}
        title={
          <>
            Versão {version.version} de “{version.data.title}”
          </>
        }
        action={
          <>
            <ButtonLink href={contentHref} variant="plain" size="sm" icon={<TbArrowNarrowLeft />}>
              Voltar às versões
            </ButtonLink>
            {can(actor, 'content.write') && (
              <ButtonLink href={`${contentHref}/editar`} variant="solid" size="sm">
                Editar
              </ButtonLink>
            )}
          </>
        }
      />
      <PageMeta
        items={[
          <StateTag key="status" color={CONTENT_STATUS_TAG[version.status]}>
            {CONTENT_STATUS_LABEL[version.status]}
          </StateTag>,
          `Gravada em ${formatDateTime(version.createdAt, timeZone)}`,
          version.version === latest ? 'Versão mais recente' : `Mais recente: ${latest}`,
        ]}
      />
      <ContentVersionView data={version.data} />
    </article>
  );
}
