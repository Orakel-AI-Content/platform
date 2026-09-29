// Construtores de dados válidos para os testes da v1. Cada teste parte de um valor
// válido e quebra só o que quer verificar. Não faz parte da superfície pública.
import type { Content, Media, SiteConfig } from './entities/index.ts';
import { RESOURCES } from './resources.ts';
import type { SnapshotLine } from './snapshot.ts';

export function buildConfig(overrides: Partial<SiteConfig> = {}): SiteConfig {
  return {
    siteId: 'teste',
    name: 'Site de teste',
    domains: ['teste.com.br'],
    language: 'pt-BR',
    timeZone: 'America/Sao_Paulo',
    indexavel: false,
    theme: 'teste',
    presets: { home: 'padrao', artigo: 'padrao', categoria: 'padrao', autor: 'padrao' },
    variants: { articleCard: 'vertical' },
    featureFlags: {},
    integrations: { ga4: { enabled: false } },
    ...overrides,
  };
}

export function buildMedia(id: number, overrides: Partial<Media> = {}): Media {
  const { widths, formats } = RESOURCES.imageProfile;
  return {
    id,
    width: 1920,
    height: 1080,
    variants: widths.flatMap((width) =>
      formats.map((format) => ({ width, format, path: `teste/m${id}-${width}.${format}` })),
    ),
    ...overrides,
  };
}

export function buildContent(overrides: Partial<Content> = {}): Content {
  return {
    id: 1,
    kind: 'article',
    slug: 'artigo-de-teste',
    title: 'Artigo de teste',
    authorIds: [1],
    taxonomyIds: [1],
    coverMediaId: 1,
    publishedAt: '2026-09-29T12:00:00-03:00',
    blocks: [
      {
        n: 1,
        type: 'text',
        content: [{ type: 'paragraph', children: [{ type: 'text', text: 'Olá' }] }],
      },
      { n: 2, type: 'image', mediaId: 1, alt: 'Descrição' },
    ],
    ...overrides,
  };
}

/** Snapshot válido de um site: header, config, autor, taxonomia, menu, mídia, redirect, conteúdo e end. */
export function buildSnapshotLines(): SnapshotLine[] {
  return [
    { type: 'header', schemaVersion: 1, site: 'teste', pendingChangeIds: [1] },
    { type: 'config', data: buildConfig() },
    { type: 'author', data: { id: 1, slug: 'autora', name: 'Autora', avatarMediaId: 1 } },
    { type: 'taxonomy', data: { id: 1, kind: 'category', slug: 'geral', name: 'Geral' } },
    { type: 'menu', data: { id: 1, key: 'principal', items: [{ label: 'Início', href: '/' }] } },
    { type: 'media', data: buildMedia(1) },
    {
      type: 'redirect',
      data: {
        id: 1,
        from: '/antigo/',
        to: '/artigo-de-teste/',
        status: 301,
        origin: 'slug-change',
      },
    },
    { type: 'content', data: buildContent() },
    {
      type: 'end',
      counts: { config: 1, author: 1, taxonomy: 1, menu: 1, media: 1, redirect: 1, content: 1 },
    },
  ];
}
