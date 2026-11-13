import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ContentEditor } from '@/components/contents/ContentEditor';
import { noRead } from '@/components/shared/ForbiddenScreen';
import type { VersionReferences } from '@/components/contents/ContentVersionView';
import { ReviewChanges } from '@/components/review/ReviewChanges';
import { ReviewChecks } from '@/components/review/ReviewChecks';
import { ReviewPanel } from '@/components/review/ReviewPanel';
import { hasError, reviewCheckItems } from '@/components/review/reviewCheckItems.ts';
import { CONTENT_STATUS_LABEL, CONTENT_STATUS_TAG } from '@/components/shared/siteLabels.ts';
import { StateTag } from '@/components/sites/SiteStatus';
import { can } from '@/domain/access/rbac.ts';
import { reviewConfirmations } from '@/domain/reviews/confirmations.ts';
import { linkCheckFor } from '@/domain/reviews/link-checks.ts';
import { REVIEW_CHECKLIST, reviewChanges, reviewChecks } from '@/domain/reviews/reviews.ts';
import { DETAIL_SUMMARY_CLASS } from '@/components/shared/detailSummary.ts';
import { DetailLayout } from '@/components/shared/DetailLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { PageMeta } from '@/components/shared/PageMeta';
import { siteTrail } from '@/components/shared/trail.ts';
import { Button } from '@/components/ui/Button';
import Card from '@/components/ui/Card';

import { itemTitle } from '../../item-title.ts';
import { previewUrl } from '../../conteudos/content-urls.ts';
import { readContentVersions } from '../../conteudos/content-versions.ts';
import { editorOptions } from '../../conteudos/editor-options.ts';
import { readVersionReferences } from '../../conteudos/version-references.ts';
import { positiveInt } from '../../conteudos/params.ts';
import { sitePageContext } from '../../editorial-page.tsx';
import {
  approveAction,
  approvePublishAction,
  approveScheduleAction,
  amendAction,
  confirmAction,
  confirmAllAction,
  returnAction,
} from '../actions.ts';

export const dynamic = 'force-dynamic';

/** Nomes e mídias de duas versões juntos: a base e a atual de "O que mudou". */
const mergeReferences = (a: VersionReferences, b: VersionReferences): VersionReferences => ({
  authors: new Map([...a.authors, ...b.authors]),
  taxonomies: new Map([...a.taxonomies, ...b.taxonomies]),
  media: new Map([...a.media, ...b.media]),
});

type Params = { params: Promise<{ site: string; id: string }> };
type SearchParams = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** "<título> · Revisão"; sem o conteúdo, só a área. */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { site: siteId, id } = await params;
  const contentId = positiveInt(id);
  const read = contentId === undefined ? undefined : await readContentVersions(siteId, contentId);
  const latest = read?.versions.ok ? read.versions.value.at(-1) : undefined;
  return { title: itemTitle(latest?.data.title, 'Revisão') };
}

/**
 * Tela de revisão (#75): a versão mais recente na visualização do site (iframe) e, ao lado, as
 * checagens automáticas (workspace#87: as calculadas na leitura e a dos links externos, gravada
 * pelo job), o que mudou desde a última revisão (#768, só quando há uma de versão mais antiga),
 * o checklist com as confirmações gravadas na versão (#752), as decisões (só aprovar,
 * aprovar e publicar agora ou agendar, workspace#89) e a devolução ao editor (#598). Ler exige site.read; aprovar só
 * aparece com content.publish, e o domínio confere tudo de novo. Tela de detalhe do guia (#373),
 * na ordem invertida do `CustomerDetails`: a prévia é o conteúdo principal, com a largura do
 * `main`, e o painel fica abaixo dela até `xl` e ao lado a partir dele. O painel é um wizard de
 * quatro passos (#766), com o atual em `?passo=`: a página o lê e o devolve ao painel, que assim
 * volta ao mesmo passo quando remonta numa versão nova. No passo Ajustes (#767), com
 * `content.amend` e a versão em revisão, o editor no modo `amend` (#751, ADR 0022 da unidade):
 * salvar grava a N+1 em revisão e volta para cá em `?passo=ajustes`, com a prévia nova.
 */
export default async function ReviewPage({ params, searchParams }: Params & SearchParams) {
  const { site: siteId, id } = await params;
  const { passo } = await searchParams;
  const contentId = positiveInt(id);
  if (contentId === undefined) notFound();
  const context = await sitePageContext(siteId);
  if (!context.ok) return context.render;
  const { actor, db, site } = context.value;

  // A mesma leitura do título da aba (`cache`): as versões não são buscadas duas vezes.
  const read = await readContentVersions(siteId, contentId);
  if (read === undefined) return null;
  const { versions, timeZone } = read;
  if (!versions.ok) {
    if (versions.issues.some((issue) => issue.code === 'content.not_found')) notFound();
    return noRead;
  }
  const latest = versions.value.at(-1)!;
  const [checks, links, confirmations, changes] = await Promise.all([
    reviewChecks(db, actor, siteId, contentId),
    linkCheckFor(db, actor, { siteId, contentId, version: latest.version }),
    reviewConfirmations(db, actor, siteId, contentId, latest.version),
    reviewChanges(db, actor, siteId, contentId),
  ]);
  if (!checks.ok || !links.ok || !confirmations.ok || !changes.ok) return noRead;
  // "O que mudou" só com base (#768): na primeira revisão, nenhuma leitura a mais.
  const diff = changes.value;
  const references =
    diff === null
      ? undefined
      : await Promise.all([
          readVersionReferences(db, actor, siteId, diff.base),
          readVersionReferences(db, actor, siteId, latest.data),
        ]);
  if (references?.some((item) => item === undefined)) return noRead;
  const items = reviewCheckItems(checks.value.checks, links.value, latest.data.blocks);
  const preview = previewUrl(site.id, latest.data);
  // As opções do editor só são lidas quando a correção está disponível.
  const canAmend = can(actor, 'content.amend');
  const options =
    canAmend && latest.status === 'em_revisao' ? await editorOptions(db, actor, siteId) : undefined;

  return (
    <section aria-labelledby="review-title" className="list-width space-y-4">
      <PageHeader
        id="review-title"
        trail={siteTrail(site, { label: 'Revisão', segment: 'revisao' }, [
          { label: latest.data.title },
        ])}
        title={<>Revisão de “{latest.data.title}”</>}
        action={
          // O mesmo `Button` e variante do "Ver prévia" do editor, em `sm` como as ações de
          // cabeçalho do guia.
          <Button asElement="a" href={preview} target="_blank" rel="noopener noreferrer" size="sm">
            Abrir prévia<span className="sr-only"> (abre em nova aba)</span>
          </Button>
        }
      />
      <PageMeta
        items={[
          <StateTag key="status" color={CONTENT_STATUS_TAG[latest.status]}>
            {CONTENT_STATUS_LABEL[latest.status]}
          </StateTag>,
          `Versão ${latest.version}`,
          `/${latest.data.slug}`,
        ]}
      />
      <DetailLayout>
        <Card className="w-full min-w-0">
          <iframe
            src={preview}
            title={`Visualização de “${latest.data.title}” no site`}
            className="h-[75vh] w-full rounded-md border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
          />
        </Card>
        <div className={DETAIL_SUMMARY_CLASS}>
          <ReviewPanel
            // Outra versão (depois de uma correção) começa do que está gravado nela.
            key={latest.version}
            version={latest.version}
            status={latest.status}
            step={typeof passo === 'string' ? passo : undefined}
            checks={<ReviewChecks items={items} />}
            changes={
              diff !== null &&
              references !== undefined && (
                <ReviewChanges
                  changes={diff}
                  references={mergeReferences(references[0]!, references[1]!)}
                  timeZone={timeZone}
                />
              )
            }
            canAmend={canAmend}
            amend={
              options && (
                <ContentEditor
                  mode="amend"
                  siteId={site.id}
                  backHref={`/sites/${site.id}/revisao/${contentId}?passo=ajustes`}
                  timeZone={timeZone}
                  defaultValues={latest.data}
                  options={options}
                  action={amendAction.bind(null, site.id, contentId, latest.version)}
                  previewUrl={preview}
                />
              )
            }
            blocked={hasError(items)}
            checklist={REVIEW_CHECKLIST.map(({ key, label }) => ({ key, label }))}
            confirmed={confirmations.value.map((confirmation) => confirmation.key)}
            canApprove={can(actor, 'content.publish')}
            confirm={confirmAction.bind(null, site.id, contentId, latest.version)}
            confirmAll={confirmAllAction.bind(null, site.id, contentId, latest.version)}
            approve={approveAction.bind(null, site.id, contentId, latest.version)}
            approvePublish={approvePublishAction.bind(null, site.id, contentId, latest.version)}
            approveSchedule={approveScheduleAction.bind(null, site.id, contentId, latest.version)}
            giveBack={returnAction.bind(null, site.id, contentId, latest.version)}
          />
        </div>
      </DetailLayout>
    </section>
  );
}
