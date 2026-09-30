import { beforeAll, describe, expect, it } from 'vitest';
import type { Snapshot } from '@orakel/content-model/v1';
import { renderHead, type HeadTag } from '../head.ts';
import { seoHead } from './seo.ts';
import { changed, fixture, indexable } from './test-snapshots.ts';

let a: Snapshot;
let guide: Snapshot['contents'][number];
beforeAll(async () => {
  a = indexable(await fixture('exemplo-a'));
  guide = a.contents.find((content) => content.slug === 'guia-completo')!;
});

const find = (tags: HeadTag[], key: string) =>
  tags.flatMap((tag) =>
    tag.tag === 'meta' && (tag.attrs.property === key || tag.attrs.name === key)
      ? [tag.attrs.content]
      : tag.tag === 'link' && tag.attrs.rel === key
        ? [tag.attrs.href]
        : tag.tag === 'title' && key === 'title'
          ? [tag.text]
          : [],
  );

const jsonLd = (tags: HeadTag[]) => {
  const tag = tags.find((item) => item.tag === 'jsonld');
  return tag?.tag === 'jsonld' ? (tag.data as { '@graph': Record<string, unknown>[] }) : undefined;
};

describe('seoHead — artigo', () => {
  it('gera o head completo do artigo da fixture', () => {
    expect(renderHead(seoHead({ type: 'content', content: guide }, a))).toMatchSnapshot();
  });

  it('liga Article, Person, Organization e BreadcrumbList por @id', () => {
    const graph = jsonLd(seoHead({ type: 'content', content: guide }, a))!['@graph'];
    expect(graph.map((node) => node['@type'])).toEqual([
      'Article',
      'Person',
      'Organization',
      'BreadcrumbList',
    ]);
    const [article, person, organization, breadcrumb] = graph;
    expect(article!.author).toEqual([{ '@id': person!['@id'] }]);
    expect(article!.publisher).toEqual({ '@id': organization!['@id'] });
    expect((breadcrumb!.itemListElement as { name: string }[]).map((item) => item.name)).toEqual([
      'Início',
      'Guias',
      'Guia completo para começar',
    ]);
  });

  it('usa title, description e canonical do SEO quando existem', () => {
    const content = { ...guide, seo: { description: 'SEO', canonical: 'https://outro.com/x/' } };
    const tags = seoHead({ type: 'content', content }, a);
    expect(find(tags, 'title')).toEqual(['Guia completo para começar | Exemplo A — Guias']);
    expect(find(tags, 'description')).toEqual(['SEO']);
    expect(find(tags, 'canonical')).toEqual(['https://outro.com/x/']);
  });

  it('artigo sem capa nem categoria: summary e breadcrumb curto', () => {
    const morning = a.contents.find((content) => content.slug === 'rotina-da-manha')!;
    const content = { ...morning, taxonomyIds: [], updatedAt: undefined };
    const tags = seoHead({ type: 'content', content }, a);
    expect(find(tags, 'twitter:card')).toEqual(['summary']);
    expect(find(tags, 'og:image')).toEqual([]);
    expect(find(tags, 'article:modified_time')).toEqual([content.publishedAt]);
    const breadcrumb = jsonLd(tags)!['@graph'].at(-1)!;
    expect((breadcrumb.itemListElement as unknown[]).length).toBe(2);
  });
});

describe('seoHead — demais páginas', () => {
  it('página de conteúdo: website, só breadcrumb', () => {
    const page = a.contents.find((content) => content.kind === 'page')!;
    const tags = seoHead({ type: 'content', content: page }, a);
    expect(find(tags, 'og:type')).toEqual(['website']);
    expect(find(tags, 'article:published_time')).toEqual([]);
    expect(jsonLd(tags)!['@graph'].map((node) => node['@type'])).toEqual(['BreadcrumbList']);
  });

  it('home com paginação e Organization', () => {
    const tags = seoHead({ type: 'home', page: 2 }, a);
    expect(find(tags, 'title')).toEqual(['Exemplo A — Guias — Página 2']);
    expect(find(tags, 'canonical')).toEqual(['https://exemplo-a.com.br/pagina/2/']);
    expect(jsonLd(tags)!['@graph']).toEqual([
      {
        '@type': 'Organization',
        '@id': 'https://exemplo-a.com.br/#organization',
        name: 'Exemplo A — Guias',
        url: 'https://exemplo-a.com.br/',
      },
    ]);
  });

  it('taxonomia, autor e institucional', () => {
    const taxonomy = seoHead({ type: 'taxonomy', taxonomy: a.taxonomies[0]!, page: 2 }, a);
    expect(find(taxonomy, 'title')).toEqual(['Guias — Página 2 | Exemplo A — Guias']);
    expect(find(taxonomy, 'description')).toEqual(['Guias passo a passo.']);

    const author = seoHead({ type: 'author', author: a.authors[0]! }, a);
    expect(find(author, 'og:type')).toEqual(['profile']);
    const person = jsonLd(author)!['@graph'][0]!;
    expect(person).toMatchObject({
      '@type': 'Person',
      name: 'Ana Souza',
      description: 'Escreve guias práticos há dez anos.',
      knowsAbout: 'Organização pessoal',
    });
    expect(person.image).toMatch(/^https:\/\/media\.exemplo-a\.com\.br\/.+\.webp$/);

    const about = seoHead({ type: 'institutional', key: 'about' }, a);
    expect(find(about, 'canonical')).toEqual(['https://exemplo-a.com.br/sobre/']);
    expect(find(about, 'title')).toEqual(['Sobre | Exemplo A — Guias']);
  });

  it('busca e site não indexável levam noindex', () => {
    const search = seoHead({ type: 'search' }, a);
    expect(find(search, 'robots')).toEqual(['noindex']);
    expect(jsonLd(search)).toBeUndefined();

    const hidden = changed(a, (copy) => {
      copy.config.indexavel = false;
    });
    expect(find(seoHead({ type: 'home' }, hidden), 'robots')).toEqual(['noindex']);
    expect(find(seoHead({ type: 'home' }, a), 'robots')).toEqual([]);
  });
});
