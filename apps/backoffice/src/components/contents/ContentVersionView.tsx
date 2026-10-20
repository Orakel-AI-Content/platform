import type { Block, Inline, RichText } from '@orakel/content-model/v1';
import { Fragment, type ReactNode } from 'react';

import { InfoField, InfoList } from '@/components/shared/InfoList';
import { SECTION_TITLE_CLASS } from '@/components/shared/sectionText.ts';
import { BLOCK_TYPE_LABEL, CONTENT_KIND_LABEL } from '@/components/shared/siteLabels.ts';
import Card from '@/components/ui/Card';
import type { ContentData } from '@/db/schema/index.ts';

// Leitura de uma versão de conteúdo (#44): HTML semântico desenhado no servidor, sem
// controle de formulário nem JS no cliente. Estrutural, não o tema do site (o renderizador
// do apps/blog não entra aqui: app não importa app). "Dados" e cada bloco num `Card` do Ecme, com
// os títulos de seção das outras telas (#372).

const MARK_TAG = { bold: 'strong', italic: 'em', code: 'code' } as const;

function Inlines({ nodes }: { nodes: Inline[] }) {
  return nodes.map((node, index) => {
    if (node.type === 'link') {
      return (
        <a key={index} href={node.href} rel="noopener noreferrer" className="underline">
          <Inlines nodes={node.children} />
        </a>
      );
    }
    return (
      <Fragment key={index}>
        {(node.marks ?? []).reduce<ReactNode>((child, mark) => {
          const Tag = MARK_TAG[mark];
          return <Tag>{child}</Tag>;
        }, node.text)}
      </Fragment>
    );
  });
}

/**
 * Intertítulos abaixo do `h3` do bloco: nível 2 → `h4`, nível 3 → `h5`. O modelo não impõe a
 * ordem, então um nível 3 antes de qualquer nível 2 vira `h4`, para a árvore não pular nível.
 */
function RichTextView({ nodes }: { nodes: RichText }) {
  let seenLevel2 = false;
  return nodes.map((node, index) => {
    if (node.type === 'heading') {
      if (node.level === 2) seenLevel2 = true;
      const Heading = node.level === 3 && seenLevel2 ? 'h5' : 'h4';
      return (
        <Heading key={index} className="font-semibold">
          <Inlines nodes={node.children} />
        </Heading>
      );
    }
    if (node.type === 'list') {
      const List = node.ordered ? 'ol' : 'ul';
      return (
        <List key={index} className={node.ordered ? 'list-decimal pl-6' : 'list-disc pl-6'}>
          {node.items.map((item, i) => (
            <li key={i}>
              <Inlines nodes={item} />
            </li>
          ))}
        </List>
      );
    }
    return (
      <p key={index}>
        <Inlines nodes={node.children} />
      </p>
    );
  });
}

function BlockBody({ block }: { block: Block }) {
  switch (block.type) {
    case 'text':
      return <RichTextView nodes={block.content} />;
    case 'toc':
      return <p>{block.title ?? 'Sumário gerado dos intertítulos'}</p>;
    case 'quote':
      return (
        <figure>
          <blockquote className="border-l-2 border-gray-200 pl-4 dark:border-gray-700">
            <Inlines nodes={block.content} />
          </blockquote>
          {(block.attribution ?? block.sourceUrl) && (
            <figcaption>
              {block.attribution}
              {block.sourceUrl ? ` (${block.sourceUrl})` : ''}
            </figcaption>
          )}
        </figure>
      );
    case 'image':
      return (
        <InfoList>
          <InfoField label="Mídia">{block.mediaId}</InfoField>
          <InfoField label="Texto alternativo">
            {block.decorative === true ? 'Decorativa' : block.alt}
          </InfoField>
          {block.caption && (
            <InfoField label="Legenda">
              <Inlines nodes={block.caption} />
            </InfoField>
          )}
        </InfoList>
      );
    case 'faq':
      return (
        <dl className="space-y-2">
          {block.items.map((item, i) => (
            <div key={i}>
              <dt className="font-medium text-gray-900 dark:text-gray-100">{item.question}</dt>
              <dd>
                <Inlines nodes={item.answer} />
              </dd>
            </div>
          ))}
        </dl>
      );
  }
}

/** Metadados e blocos de uma versão, só para ler. */
export function ContentVersionView({ data }: { data: ContentData }) {
  const ids = (values: number[]) => (values.length > 0 ? values.join(', ') : '—');
  const meta: [string, ReactNode][] = [
    ['Tipo', CONTENT_KIND_LABEL[data.kind]],
    ['Título', data.title],
    ['Slug', data.slug],
    ['Descrição', data.description ?? '—'],
    ['Autores (IDs)', ids(data.authorIds)],
    ['Taxonomias (IDs)', ids(data.taxonomyIds)],
    ['Capa (mídia)', data.coverMediaId ?? '—'],
    ['Data de publicação', data.publishedAt],
    ['Título SEO', data.seo?.title ?? '—'],
    ['Descrição SEO', data.seo?.description ?? '—'],
    ['Canônico', data.seo?.canonical ?? '—'],
  ];
  return (
    <div className="space-y-4">
      <section aria-labelledby="version-meta">
        <Card bodyClass="space-y-3">
          <h2 id="version-meta" className={SECTION_TITLE_CLASS}>
            Dados
          </h2>
          {/* Duas colunas a partir de `sm`, a grade do `ProfileSection` dentro do `form-width`. */}
          <InfoList className="sm:grid-cols-2">
            {meta.map(([label, value]) => (
              <InfoField key={label} label={label}>
                {value}
              </InfoField>
            ))}
          </InfoList>
        </Card>
      </section>
      <section aria-labelledby="version-blocks" className="space-y-4">
        <h2 id="version-blocks" className={SECTION_TITLE_CLASS}>
          Blocos
        </h2>
        <ol className="space-y-4">
          {data.blocks.map((block) => (
            <li key={block.n}>
              <Card bodyClass="space-y-3 text-sm">
                <h3 className={SECTION_TITLE_CLASS}>
                  {BLOCK_TYPE_LABEL[block.type]} · bloco {block.n}
                </h3>
                <BlockBody block={block} />
              </Card>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
