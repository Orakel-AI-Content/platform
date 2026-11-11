import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ContentVersionsTable } from '@/components/contents/ContentVersionsTable';
import { noRead } from '@/components/shared/ForbiddenScreen';
import { ContentActionScope } from '@/components/contents/ContentActionScope';
import { ContentSummary } from '@/components/contents/ContentSummary';
import { ContentViewLinks } from '@/components/contents/ContentViewLinks';
import { PublishActions } from '@/components/contents/PublishActions';
import { SubmitForReview } from '@/components/contents/SubmitForReview';
import { UnpublishDialog } from '@/components/contents/UnpublishDialog';
import { getDb } from '@/db/client.ts';
import { can } from '@/domain/access/rbac.ts';
import { LIVE_STATUSES, listLiveContents } from '@/domain/content/contents.ts';
import { scheduledPublicationAt } from '@/domain/publications/schedule.ts';
import { DetailLayout } from '@/components/shared/DetailLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { SECTION_TITLE_CLASS } from '@/components/shared/sectionText.ts';
import { siteTrail } from '@/components/shared/trail.ts';
import ButtonLink from '@/components/ui/Button/ButtonLink';
import Card from '@/components/ui/Card';

import { itemTitle } from '../../item-title.ts';
import {
  cancelScheduledPublicationAction,
  publishVersionAction,
  schedulePublicationAction,
  submitForReviewAction,
  unpublishContentAction,
} from '../actions.ts';
import { previewUrl, publicUrl } from '../content-urls.ts';
import { readContentVersions } from '../content-versions.ts';
import { contentReferences } from '../editor-options.ts';
import { referenceLabels } from '../version-references.ts';
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

/** A versão no ar entre as versões lidas: a mais recente entre `LIVE_STATUSES`, se `publicado`. */
function liveOf<V extends { status: string }>(versions: readonly V[]): V | undefined {
  const last = versions.findLast((version) =>
    (LIVE_STATUSES as readonly string[]).includes(version.status),
  );
  return last?.status === 'publicado' ? last : undefined;
}

/**
 * Um conteúdo na tela de detalhe do guia (#371): o título no PageHeader com as ações de quem tem
 * content.write ("Editar" e, com a versão mais recente em rascunho, "Enviar para revisão") e as
 * de quem tem content.publish: "Publicar" e "Agendar" para a versão aprovada, ou o horário
 * marcado e "Cancelar agendamento" para a agendada (#492), e, com o conteúdo no ar,
 * "Despublicar" (#494), com o destino do 301 entre os conteúdos no ar do site; o revisor tem
 * content.publish sem content.write. O domínio confere de novo. Abaixo, o resumo à esquerda e as versões,
 * da primeira à mais recente, à direita (empilham abaixo de `xl`). A recusa das ações vai ao
 * Alert do escopo, logo abaixo da linha do título. Para todo leitor (#597), "Ver prévia" da versão
 * mais recente e, com o conteúdo no ar, "Ver no site"; no resumo, autores e taxonomias pelo nome
 * (as leituras do editor) e as datas de publicação e da última alteração.
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
  const canPublish = can(actor, 'content.publish');
  const version = latest.version;
  const scheduled =
    canPublish && latest.status === 'agendado'
      ? await scheduledPublicationAt(getDb().db, actor, siteId, contentId, version)
      : undefined;
  const live = liveOf(versions.value);
  const [references, targets] = await Promise.all([
    contentReferences(getDb().db, actor, siteId),
    canPublish && live !== undefined ? listLiveContents(getDb().db, actor, siteId) : undefined,
  ]);
  if (references === undefined) return noRead;
  const unpublish =
    live !== undefined && targets?.ok ? (
      <UnpublishDialog
        contentId={contentId}
        slug={live.data.slug}
        targets={targets.value}
        action={unpublishContentAction.bind(null, siteId, contentId)}
      />
    ) : undefined;

  const header = (
    <PageHeader
      id="content-title"
      trail={siteTrail(site, { label: 'Conteúdos', segment: 'conteudos' }, [
        { label: latest.data.title },
      ])}
      title={latest.data.title}
      action={
        <>
          <ContentViewLinks
            previewUrl={previewUrl(siteId, latest.data)}
            publicUrl={live === undefined ? undefined : publicUrl(site.domain, live.data)}
          />
          {canPublish && (
            <PublishActions
              status={latest.status}
              scheduledAt={scheduled?.ok ? scheduled.value : null}
              publish={publishVersionAction.bind(null, siteId, contentId, version)}
              schedule={schedulePublicationAction.bind(null, siteId, contentId, version)}
              cancel={cancelScheduledPublicationAction.bind(null, siteId, contentId, version)}
            />
          )}
          {canWrite && (
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
          )}
          {unpublish}
        </>
      }
    />
  );

  return (
    <section aria-labelledby="content-title" className="list-width space-y-4">
      {canWrite || canPublish ? <ContentActionScope>{header}</ContentActionScope> : header}
      <DetailLayout>
        <ContentSummary
          contentId={contentId}
          data={latest.data}
          status={latest.status}
          updatedAt={latest.createdAt}
          timeZone={timeZone}
          references={referenceLabels(references)}
        />
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
      </DetailLayout>
    </section>
  );
}
