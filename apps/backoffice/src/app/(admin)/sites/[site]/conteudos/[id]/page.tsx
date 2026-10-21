import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ContentVersionsTable } from '@/components/contents/ContentVersionsTable';
import {
  CONTENT_KIND_LABEL,
  CONTENT_STATUS_LABEL,
  CONTENT_STATUS_TAG,
} from '@/components/shared/siteLabels.ts';
import { noRead } from '@/components/shared/ForbiddenScreen';
import { SubmitForReview, SubmitForReviewScope } from '@/components/contents/SubmitForReview';
import { can } from '@/domain/access/rbac.ts';
import {
  DETAIL_SUMMARY_CLASS,
  DETAIL_SUMMARY_LIST_CLASS,
} from '@/components/shared/detailSummary.ts';
import { InfoField, InfoList } from '@/components/shared/InfoList';
import { PageHeader } from '@/components/shared/PageHeader';
import { SECTION_TITLE_CLASS } from '@/components/shared/sectionText.ts';
import { siteTrail } from '@/components/shared/trail.ts';
import { StateTag } from '@/components/sites/SiteStatus';
import ButtonLink from '@/components/ui/Button/ButtonLink';
import Card from '@/components/ui/Card';

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
 * Um conteúdo na tela de detalhe do guia (#371): o título no PageHeader com as ações de quem tem
 * content.write ("Editar" e, com a versão mais recente em rascunho, "Enviar para revisão"; o
 * domínio confere de novo); abaixo, o resumo à esquerda e as versões, da primeira à mais
 * recente, à direita (empilham abaixo de `xl`). A recusa do envio vai ao Alert do escopo, logo
 * abaixo da linha do título.
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

  const header = (
    <PageHeader
      id="content-title"
      trail={siteTrail(site, { label: 'Conteúdos', segment: 'conteudos' }, [
        { label: latest.data.title },
      ])}
      title={latest.data.title}
      action={
        canWrite ? (
          <>
            <ButtonLink
              href={`/sites/${siteId}/conteudos/${contentId}/editar`}
              variant="solid"
              size="sm"
            >
              Editar
            </ButtonLink>
            <SubmitForReview
              available={latest.status === 'rascunho'}
              action={submitForReviewAction.bind(null, siteId, contentId)}
            />
          </>
        ) : undefined
      }
    />
  );

  return (
    <section aria-labelledby="content-title" className="list-width space-y-4">
      {canWrite ? <SubmitForReviewScope>{header}</SubmitForReviewScope> : header}
      <div className="flex flex-col gap-4 xl:flex-row">
        <Card className={DETAIL_SUMMARY_CLASS}>
          <InfoList className={DETAIL_SUMMARY_LIST_CLASS}>
            <InfoField label="Tipo">{CONTENT_KIND_LABEL[latest.data.kind]}</InfoField>
            <InfoField label="ID" className="tabular-nums">
              {contentId}
            </InfoField>
            <InfoField label="Slug">/{latest.data.slug}</InfoField>
            <InfoField label="Estado">
              <StateTag color={CONTENT_STATUS_TAG[latest.status]}>
                {CONTENT_STATUS_LABEL[latest.status]}
              </StateTag>
            </InfoField>
          </InfoList>
        </Card>
        <Card className="w-full min-w-0" bodyClass="flex flex-col gap-4">
          <h2 id="versions-title" className={SECTION_TITLE_CLASS}>
            Versões
          </h2>
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
        </Card>
      </div>
    </section>
  );
}
