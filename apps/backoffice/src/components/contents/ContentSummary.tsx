import {
  DETAIL_SUMMARY_CLASS,
  DETAIL_SUMMARY_LIST_CLASS,
} from '@/components/shared/detailSummary.ts';
import { InfoField, InfoList } from '@/components/shared/InfoList';
import {
  CONTENT_KIND_LABEL,
  CONTENT_STATUS_LABEL,
  CONTENT_STATUS_TAG,
  formatDateTime,
} from '@/components/shared/siteLabels.ts';
import { StateTag } from '@/components/sites/SiteStatus';
import Card from '@/components/ui/Card';
import type { ContentData } from '@/db/schema/index.ts';
import type { ContentVersion } from '@/domain/content/contents.ts';

import { referenceNames, type VersionReferences } from './ContentVersionView.tsx';

// Resumo do detalhe do conteúdo (#371, #597): o cartão de perfil do `CustomerDetails` do Ecme,
// com a versão mais recente. Autores e taxonomias pelo nome, como na leitura da versão (#593), e
// as datas no fuso do site: a de publicação do conteúdo e a gravação da versão mais recente.

export function ContentSummary({
  contentId,
  data,
  status,
  updatedAt,
  timeZone,
  references,
}: {
  contentId: number;
  data: Pick<ContentData, 'kind' | 'slug' | 'authorIds' | 'taxonomyIds' | 'publishedAt'>;
  status: ContentVersion['status'];
  /** Quando a versão mais recente foi gravada. */
  updatedAt: Date;
  timeZone: string;
  references: Pick<VersionReferences, 'authors' | 'taxonomies'>;
}) {
  return (
    <Card className={DETAIL_SUMMARY_CLASS}>
      <InfoList className={DETAIL_SUMMARY_LIST_CLASS}>
        <InfoField label="Tipo">{CONTENT_KIND_LABEL[data.kind]}</InfoField>
        <InfoField label="ID" className="tabular-nums">
          {contentId}
        </InfoField>
        <InfoField label="Slug">/{data.slug}</InfoField>
        <InfoField label="Status">
          <StateTag color={CONTENT_STATUS_TAG[status]}>{CONTENT_STATUS_LABEL[status]}</StateTag>
        </InfoField>
        <InfoField label="Autores">{referenceNames(data.authorIds, references.authors)}</InfoField>
        <InfoField label="Taxonomias">
          {referenceNames(data.taxonomyIds, references.taxonomies)}
        </InfoField>
        <InfoField label="Data de publicação" className="tabular-nums">
          {formatDateTime(new Date(data.publishedAt), timeZone)}
        </InfoField>
        <InfoField label="Última alteração" className="tabular-nums">
          {formatDateTime(updatedAt, timeZone)}
        </InfoField>
      </InfoList>
    </Card>
  );
}
