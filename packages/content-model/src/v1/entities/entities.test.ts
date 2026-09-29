import { describe, expect, it } from 'vitest';

import { buildConfig, buildContent, buildMedia } from '../test-builders.ts';
import {
  AuthorSchema,
  ContentSchema,
  MediaSchema,
  MenuSchema,
  RedirectSchema,
  SiteConfigSchema,
  TaxonomySchema,
} from './index.ts';

describe('SiteConfigSchema', () => {
  it('aceita a configuração mínima', () => {
    expect(SiteConfigSchema.safeParse(buildConfig()).success).toBe(true);
  });

  it('aceita crawlers, textos institucionais e GA4 ligado com ID', () => {
    const config = buildConfig({
      crawlers: { allow: ['PerplexityBot'], block: ['GPTBot'] },
      institutionalTexts: {
        about: [{ type: 'paragraph', children: [{ type: 'text', text: 'x' }] }],
      },
      integrations: { ga4: { enabled: true, measurementId: 'G-ABC123' } },
      featureFlags: { busca: true },
    });
    expect(SiteConfigSchema.safeParse(config).success).toBe(true);
  });

  it('exige o ID de medição quando o GA4 está ligado', () => {
    const result = SiteConfigSchema.safeParse(
      buildConfig({ integrations: { ga4: { enabled: true } } }),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['integrations', 'ga4', 'measurementId']);
  });

  it.each([
    ['sem domínio', { domains: [] }],
    ['domínio com esquema', { domains: ['https://x.com'] }],
    ['indexavel ausente', { indexavel: undefined }],
    ['feature flag fora de camelCase', { featureFlags: { 'Busca-Nova': true } }],
  ])('recusa %s', (_, overrides) => {
    expect(SiteConfigSchema.safeParse({ ...buildConfig(), ...overrides }).success).toBe(false);
  });
});

describe('ContentSchema', () => {
  it('aceita um artigo', () => {
    expect(ContentSchema.safeParse(buildContent()).success).toBe(true);
  });

  it('aceita uma página com SEO próprio', () => {
    const page = buildContent({
      kind: 'page',
      seo: { title: 'T', description: 'D', canonical: '/sobre/' },
    });
    expect(ContentSchema.safeParse(page).success).toBe(true);
  });

  it('recusa conteúdo sem blocos ou com ID que não é inteiro', () => {
    expect(ContentSchema.safeParse(buildContent({ blocks: [] })).success).toBe(false);
    expect(ContentSchema.safeParse({ ...buildContent(), id: 'abc' }).success).toBe(false);
  });
});

describe('demais entidades', () => {
  it('aceitam valores válidos', () => {
    expect(AuthorSchema.safeParse({ id: 1, slug: 'ana', name: 'Ana' }).success).toBe(true);
    expect(TaxonomySchema.safeParse({ id: 1, kind: 'series', slug: 's', name: 'S' }).success).toBe(
      true,
    );
    expect(
      MenuSchema.safeParse({ id: 1, key: 'rodape', items: [{ label: 'X', href: '/x/' }] }).success,
    ).toBe(true);
    expect(MediaSchema.safeParse(buildMedia(1)).success).toBe(true);
  });

  it('recusa taxonomia de tipo desconhecido e menu vazio', () => {
    expect(TaxonomySchema.safeParse({ id: 1, kind: 'topic', slug: 's', name: 'S' }).success).toBe(
      false,
    );
    expect(MenuSchema.safeParse({ id: 1, key: 'rodape', items: [] }).success).toBe(false);
  });

  it('recusa variante de mídia com caminho absoluto', () => {
    const media = buildMedia(1, { variants: [{ width: 320, format: 'avif', path: '/x.avif' }] });
    expect(MediaSchema.safeParse(media).success).toBe(false);
  });

  describe('redirect', () => {
    const redirect = { id: 1, from: '/a/', to: '/b/', status: 301, origin: 'manual' };

    it.each([301, 302, 303, 307, 308])('aceita status %s', (status) => {
      expect(RedirectSchema.safeParse({ ...redirect, status }).success).toBe(true);
    });

    it('recusa 410, que o Workers Static Assets não oferece', () => {
      expect(RedirectSchema.safeParse({ ...redirect, status: 410 }).success).toBe(false);
    });

    it('exige origem como caminho do site', () => {
      expect(RedirectSchema.safeParse({ ...redirect, from: 'https://x.com/a' }).success).toBe(
        false,
      );
    });
  });
});
