import type { Block, Inline, RichText } from '@orakel/content-model/v1';
import { Fragment, type ReactNode } from 'react';

import { BLOCK_TYPE_LABEL, CONTENT_KIND_LABEL } from '@/components/shared/siteLabels.ts';
import type { ContentData } from '@/db/schema/index.ts';

// Leitura de uma versão de conteúdo (#44): HTML semântico desenhado no servidor, sem
// controle de formulário nem JS no cliente. Estrutural, não o tema do site (o renderizador
// do apps/blog não entra aqui: app não importa app).

const MARK_TAG = { bold: 'strong', italic: 'em', code: 'code' } as const;

// Valor de um par rótulo/valor: o rótulo fica no cinza do body, o valor no tom dos títulos.
const VALUE = 'text-gray-900 dark:text-gray-100';

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

function RichTextView({ nodes }: { nodes: RichText }) {
  return nodes.map((node, index) => {
    if (node.type === 'heading') {
      const Heading = node.level === 2 ? 'h4' : 'h5';
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
            <figcaption className="text-sm">
              {block.attribution}
              {block.sourceUrl ? ` (${block.sourceUrl})` : ''}
            </figcaption>
          )}
        </figure>
      );
    case 'image':
      return (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt>Mídia</dt>
          <dd className={VALUE}>{block.mediaId}</dd>
          <dt>Texto alternativo</dt>
          <dd className={VALUE}>{block.decorative === true ? 'Decorativa' : block.alt}</dd>
          {block.caption && (
            <>
              <dt>Legenda</dt>
              <dd className={VALUE}>
                <Inlines nodes={block.caption} />
              </dd>
            </>
          )}
        </dl>
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
    <div className="space-y-6">
      <section aria-labelledby="version-meta" className="space-y-3">
        <h2 id="version-meta" className="text-lg font-semibold">
          Dados
        </h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {meta.map(([label, value]) => (
            <div key={label} className="contents">
              <dt>{label}</dt>
              <dd className={VALUE}>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-labelledby="version-blocks" className="space-y-3">
        <h2 id="version-blocks" className="text-lg font-semibold">
          Blocos
        </h2>
        <ol className="space-y-4">
          {data.blocks.map((block) => (
            <li
              key={block.n}
              className="space-y-2 rounded-xl border border-gray-200 p-4 dark:border-gray-700"
            >
              <h3 className="text-sm font-semibold">
                {BLOCK_TYPE_LABEL[block.type]} · bloco {block.n}
              </h3>
              <BlockBody block={block} />
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
