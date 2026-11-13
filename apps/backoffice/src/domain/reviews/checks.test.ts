import type { Issue } from '@orakel/content-model';
import type { Block, SiteConfig } from '@orakel/content-model/v1';
import { describe, expect, expectTypeOf, it } from 'vitest';

import type { ContentData } from '../../db/schema/index.ts';
import {
  checkContextFor,
  computeReviewChecks,
  REVIEW_CHECKS,
  type ReviewCheckContext,
  type ReviewCheckKey,
  type SiteCheckContext,
  sitePaths,
} from './checks.ts';

const paragraph = (text: string): Block => ({
  n: 1,
  type: 'text',
  content: [{ type: 'paragraph', children: [{ type: 'text', text }] }],
});

const linkBlock = (n: number, href: string): Block => ({
  n,
  type: 'text',
  content: [
    {
      type: 'paragraph',
      children: [{ type: 'link', href, children: [{ type: 'text', text: 'veja' }] }],
    },
  ],
});

/** Versão sem nenhum aviso no `context` abaixo. */
const data = (overrides: Partial<ContentData> = {}): ContentData => ({
  kind: 'article',
  slug: 'guia',
  title: 'Guia completo',
  description: 'Tudo para começar.',
  authorIds: [1],
  taxonomyIds: [1],
  coverMediaId: 1,
  publishedAt: '2026-09-20T10:00:00-03:00',
  blocks: [paragraph('Olá')],
  ...overrides,
});

const config = {
  institutionalTexts: {
    about: [{ type: 'paragraph', children: [{ type: 'text', text: 'Sobre' }] }],
  },
} as unknown as SiteConfig;

const context = (overrides: Partial<ReviewCheckContext> = {}): ReviewCheckContext => ({
  paths: sitePaths({
    liveSlugs: ['outro-guia'],
    taxonomies: [
      { kind: 'category', slug: 'guias' },
      { kind: 'tag', slug: 'iniciantes' },
    ],
    authorSlugs: ['ana-souza'],
    config,
    redirectFroms: ['/guia-antigo', '/arquivo/*', '/ano/:ano/'],
  }),
  categoryIds: new Set([1]),
  otherTitles: [{ contentId: 2, title: 'Outro guia' }],
  ...overrides,
});

const check = (
  key: ReviewCheckKey,
  version = data(),
  validation: Issue[] = [],
  ctx = context(),
) => {
  const found = computeReviewChecks(version, validation, ctx).find((item) => item.key === key);
  if (found === undefined) throw new Error(`checagem ${key} ausente`);
  return found;
};

describe('computeReviewChecks', () => {
  it('devolve todas as checagens na ordem, todas ok numa versão sem problema', () => {
    const checks = computeReviewChecks(data(), [], context());
    expect(checks.map((item) => item.key)).toEqual(REVIEW_CHECKS.map((item) => item.key));
    expect(checks.every((item) => item.level === 'ok' && item.findings.length === 0)).toBe(true);
  });

  describe('imagens e validação da release', () => {
    const withImage = data({
      blocks: [paragraph('Olá'), { n: 2, type: 'image', mediaId: 1 }],
    });
    const altIssue: Issue = {
      code: 'schema.custom',
      message: 'Informe o texto alternativo ou marque a imagem como decorativa',
      path: ['blocks', 1, 'alt'],
    };
    const releaseIssue: Issue = {
      code: 'semantic.supported-resources',
      message: 'Bloco faq não é suportado',
      path: ['blocks', 0, 'type'],
    };

    it('a issue de alt vira erro em imagens, com o caminho do bloco', () => {
      expect(check('imagens', withImage, [altIssue])).toMatchObject({
        level: 'erro',
        findings: [{ message: altIssue.message, path: ['blocks', 1, 'alt'] }],
      });
      expect(check('validacao_release', withImage, [altIssue])).toMatchObject({ level: 'ok' });
    });

    it('as demais issues da validação viram erro em validacao_release', () => {
      expect(check('validacao_release', withImage, [releaseIssue])).toMatchObject({
        level: 'erro',
        findings: [{ message: releaseIssue.message, path: ['blocks', 0, 'type'] }],
      });
      expect(check('imagens', withImage, [releaseIssue])).toMatchObject({ level: 'ok' });
    });
  });

  it('sem capa: aviso em coverMediaId', () => {
    expect(check('capa', data({ coverMediaId: undefined }))).toMatchObject({
      level: 'aviso',
      findings: [{ path: ['coverMediaId'] }],
    });
  });

  it('sem taxonomia de categoria: aviso; uma tag não conta', () => {
    expect(check('categoria', data({ taxonomyIds: [2] }))).toMatchObject({
      level: 'aviso',
      findings: [{ path: ['taxonomyIds'] }],
    });
  });

  it('sem descrição: aviso em description', () => {
    expect(check('descricao', data({ description: undefined }))).toMatchObject({
      level: 'aviso',
      findings: [{ path: ['description'] }],
    });
  });

  describe('tamanho do SEO', () => {
    it('título efetivo com 60 caracteres passa; com 61 avisa', () => {
      expect(check('seo_titulo', data({ title: 'a'.repeat(60) })).level).toBe('ok');
      expect(check('seo_titulo', data({ title: 'a'.repeat(61) }))).toMatchObject({
        level: 'aviso',
        findings: [{ path: ['title'] }],
      });
    });

    it('seo.title vale no lugar do título', () => {
      const long = data({ title: 'a'.repeat(80), seo: { title: 'Curto' } });
      expect(check('seo_titulo', long).level).toBe('ok');
      expect(check('seo_titulo', data({ seo: { title: 'a'.repeat(61) } }))).toMatchObject({
        findings: [{ path: ['seo', 'title'] }],
      });
    });

    it('descrição efetiva com 160 caracteres passa; com 161 avisa', () => {
      expect(check('seo_descricao', data({ description: 'a'.repeat(160) })).level).toBe('ok');
      expect(check('seo_descricao', data({ description: 'a'.repeat(161) }))).toMatchObject({
        level: 'aviso',
        findings: [{ path: ['description'] }],
      });
      expect(check('seo_descricao', data({ seo: { description: 'a'.repeat(161) } }))).toMatchObject(
        { findings: [{ path: ['seo', 'description'] }] },
      );
    });

    it('sem descrição, a checagem de SEO não repete o aviso de descricao', () => {
      expect(check('seo_descricao', data({ description: undefined })).level).toBe('ok');
    });
  });

  describe('links internos', () => {
    it.each([
      ['conteúdo no ar', '/outro-guia/'],
      ['conteúdo sem barra final e com âncora', '/outro-guia#passo-2'],
      ['o próprio conteúdo', '/guia/'],
      ['início', '/'],
      ['busca', '/busca/?q=x'],
      ['categoria', '/categoria/guias/'],
      ['tag', '/tag/iniciantes/'],
      ['autor', '/autor/ana-souza/'],
      ['institucional com texto', '/sobre/'],
      ['redirect', '/guia-antigo/'],
      ['redirect com splat', '/arquivo/2020/x/'],
      ['redirect com placeholder', '/ano/2024/'],
      ['link externo', 'https://exemplo.org/nao-existe/'],
    ])('%s não gera aviso', (_, href) => {
      expect(check('links_internos', data({ blocks: [linkBlock(1, href)] })).level).toBe('ok');
    });

    it.each([
      ['caminho inexistente', '/nao-existe/'],
      ['institucional sem texto', '/contato/'],
      ['rascunho fora do ar', '/rascunho/'],
    ])('%s gera aviso apontando o bloco', (_, href) => {
      const version = data({ blocks: [paragraph('Olá'), linkBlock(2, href)] });
      expect(check('links_internos', version)).toMatchObject({
        level: 'aviso',
        findings: [{ path: ['blocks', 1] }],
      });
    });

    it('confere links em listas, citações e FAQ', () => {
      const blocks: Block[] = [
        {
          n: 1,
          type: 'text',
          content: [
            {
              type: 'list',
              ordered: false,
              items: [[{ type: 'link', href: '/x/', children: [{ type: 'text', text: 'x' }] }]],
            },
          ],
        },
        {
          n: 2,
          type: 'quote',
          content: [{ type: 'link', href: '/y/', children: [{ type: 'text', text: 'y' }] }],
        },
        {
          n: 3,
          type: 'faq',
          items: [
            {
              question: 'Onde?',
              answer: [{ type: 'link', href: '/z/', children: [{ type: 'text', text: 'z' }] }],
            },
          ],
        },
      ];
      expect(check('links_internos', data({ blocks })).findings.map((f) => f.path)).toEqual([
        ['blocks', 0],
        ['blocks', 1],
        ['blocks', 2],
      ]);
    });
  });

  describe('título duplicado', () => {
    it('igual ao de outro conteúdo do site, sem diferença de caixa e espaços: aviso', () => {
      expect(check('titulo_duplicado', data({ title: '  outro GUIA ' }))).toMatchObject({
        level: 'aviso',
        findings: [{ path: ['title'], message: 'O conteúdo 2 tem o mesmo título' }],
      });
    });

    it('diferente dos outros: ok', () => {
      expect(check('titulo_duplicado').level).toBe('ok');
    });
  });
});

describe('checkContextFor', () => {
  const site: SiteCheckContext = {
    live: [
      { id: 1, slug: 'proprio' },
      { id: 2, slug: 'outro' },
    ],
    taxonomies: [
      { id: 10, kind: 'category', slug: 'guias' },
      { id: 11, kind: 'tag', slug: 'rapido' },
    ],
    authorSlugs: ['ana'],
    config: undefined,
    redirectFroms: ['/antigo/'],
    titles: [
      { contentId: 1, title: 'Próprio' },
      { contentId: 2, title: 'Outro' },
    ],
  };

  it('é pura: recebe o contexto do site já lido e o conteúdo, nunca o banco (#772)', () => {
    expectTypeOf(checkContextFor).parameters.toEqualTypeOf<[SiteCheckContext, number]>();
  });

  it('tira o próprio conteúdo dos caminhos no ar e dos títulos', () => {
    const context = checkContextFor(site, 1);

    expect(context.paths.static.has('/outro/')).toBe(true);
    expect(context.paths.static.has('/proprio/')).toBe(false);
    expect(context.paths.static.has('/antigo/')).toBe(true);
    expect(context.otherTitles).toEqual([{ contentId: 2, title: 'Outro' }]);
    expect([...context.categoryIds]).toEqual([10]);
  });
});
