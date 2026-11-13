import type { Block } from '@orakel/content-model/v1';
import { useId, type ReactNode } from 'react';

import {
  BlockBody,
  MediaPreview,
  referenceNames,
  type VersionReferences,
} from '@/components/contents/ContentVersionView';
import { SECTION_HINT_CLASS, SECTION_TITLE_CLASS } from '@/components/shared/sectionText.ts';
import { BLOCK_TYPE_LABEL, formatDateTime } from '@/components/shared/siteLabels.ts';
import Card from '@/components/ui/Card';
import type {
  BlockChange,
  ChangeField,
  FieldValue,
  VersionChanges,
} from '@/domain/reviews/changes.ts';
import type { ReviewCorrection } from '@/domain/reviews/reviews.ts';

// "O que mudou" da revisão (#768), no passo Checagens: os metadados e os blocos que mudaram desde
// a versão da última revisão, com o antes e o depois. O cálculo é do domínio (`changes.ts`);
// aqui só a apresentação. Os blocos usam a mesma leitura da página da versão (`BlockBody`), e
// nomes e mídias vêm resolvidos pela página. Sem `'use client'`, como o `ReviewChecks`: a página
// a desenha no servidor e a passa ao painel. Sem base (primeira revisão), a página não a mostra.
// Versão da correção automática (#804): o comentário da devolução que a pediu vem junto.

/** Os rótulos da leitura da versão (`ContentVersionView`). */
const FIELD_LABEL: Record<ChangeField, string> = {
  title: 'Título',
  description: 'Descrição',
  taxonomyIds: 'Taxonomias',
  coverMediaId: 'Capa',
  publishedAt: 'Data de publicação',
  seoTitle: 'Título SEO',
  seoDescription: 'Descrição SEO',
  seoCanonical: 'Canônico',
};

const KIND_LABEL: Record<BlockChange['kind'], string> = {
  adicionado: 'Adicionado',
  removido: 'Removido',
  alterado: 'Alterado',
};

export type ReviewChangesData = VersionChanges & {
  baseVersion: number;
  version: number;
  /** A devolução que pediu a correção automática da versão; `null` fora dela. */
  correction: ReviewCorrection | null;
};

function fieldValue(
  field: ChangeField,
  value: FieldValue,
  references: VersionReferences,
  timeZone: string,
): ReactNode {
  if (value === undefined) return '—';
  if (field === 'taxonomyIds' && Array.isArray(value)) {
    return referenceNames(value, references.taxonomies);
  }
  if (field === 'coverMediaId' && typeof value === 'number') {
    return <MediaPreview id={value} item={references.media.get(value)} />;
  }
  if (field === 'publishedAt' && typeof value === 'string') {
    return formatDateTime(new Date(value), timeZone);
  }
  return String(value);
}

const SIDE_LABEL_CLASS = 'font-semibold text-gray-900 dark:text-gray-100';

function BlockSide({
  label,
  block,
  media,
}: {
  label: string;
  block: Block;
  media: VersionReferences['media'];
}) {
  return (
    <div className="space-y-1">
      <p className={SIDE_LABEL_CLASS}>{label}</p>
      <BlockBody block={block} media={media} />
    </div>
  );
}

export function ReviewChanges({
  changes,
  references,
  timeZone,
}: {
  changes: ReviewChangesData;
  /** Nomes e mídias da base e da versão atual, juntos. */
  references: VersionReferences;
  /** Fuso do site, para a data de publicação. */
  timeZone: string;
}) {
  const id = useId();
  const { fields, blocks, baseVersion, version, correction } = changes;
  return (
    <Card>
      <section aria-labelledby={`${id}-title`} className="space-y-3">
        <h2 id={`${id}-title`} className={SECTION_TITLE_CLASS}>
          O que mudou
        </h2>
        <p className={SECTION_HINT_CLASS}>
          Da versão {baseVersion}, a da última revisão, para a versão {version}.
        </p>
        {correction !== null && (
          <section aria-labelledby={`${id}-correction`} className="space-y-1 text-sm">
            <h3 id={`${id}-correction`} className={SIDE_LABEL_CLASS}>
              Correção automática
            </h3>
            <p className={SECTION_HINT_CLASS}>
              A versão {version} foi criada pela correção automática, a partir do comentário de{' '}
              {correction.reviewer} na devolução:
            </p>
            <blockquote className="border-s-4 border-gray-200 ps-3 whitespace-pre-line dark:border-gray-700">
              {correction.comment}
            </blockquote>
          </section>
        )}
        {fields.length === 0 && blocks.length === 0 && (
          <p className={SECTION_HINT_CLASS}>Nenhum campo nem bloco mudou.</p>
        )}
        {fields.length > 0 && (
          <section aria-labelledby={`${id}-fields`} className="space-y-2">
            <h3 id={`${id}-fields`} className={SIDE_LABEL_CLASS}>
              Campos
            </h3>
            <dl className="divide-y divide-gray-200 text-sm dark:divide-gray-700">
              {fields.map((change) => (
                <div key={change.field} className="space-y-1 py-2 first:pt-0 last:pb-0">
                  <dt className={SIDE_LABEL_CLASS}>{FIELD_LABEL[change.field]}</dt>
                  <dd>
                    <span className="font-semibold">Antes: </span>
                    {fieldValue(change.field, change.before, references, timeZone)}
                  </dd>
                  <dd>
                    <span className="font-semibold">Depois: </span>
                    {fieldValue(change.field, change.after, references, timeZone)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        {blocks.length > 0 && (
          <section aria-labelledby={`${id}-blocks`} className="space-y-2">
            <h3 id={`${id}-blocks`} className={SIDE_LABEL_CLASS}>
              Blocos
            </h3>
            <ul className="divide-y divide-gray-200 text-sm dark:divide-gray-700">
              {blocks.map((change) => {
                const type = (change.kind === 'removido' ? change.before : change.after).type;
                return (
                  <li key={change.n} className="space-y-2 py-2 first:pt-0 last:pb-0">
                    <h4 className={SIDE_LABEL_CLASS}>
                      {BLOCK_TYPE_LABEL[type]} · bloco {change.n}: {KIND_LABEL[change.kind]}
                    </h4>
                    {change.kind !== 'adicionado' && (
                      <BlockSide label="Antes" block={change.before} media={references.media} />
                    )}
                    {change.kind !== 'removido' && (
                      <BlockSide label="Depois" block={change.after} media={references.media} />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </section>
    </Card>
  );
}
