import { describe, expect, it } from 'vitest';

import type { Issue, Result } from '../../result.ts';
import type { Content } from '../entities/index.ts';
import { requiredImageWidths, RESOURCES, type Resources } from '../resources.ts';
import type { SnapshotLine } from '../snapshot.ts';
import { buildConfig, buildContent, buildMedia, buildSnapshotLines } from '../test-builders.ts';
import { validateContent, validateMedia, validateSiteConfig, validateSnapshot } from './index.ts';

const issuesOf = (result: Result<unknown>): Issue[] => (result.ok ? [] : result.issues);
const codesOf = (result: Result<unknown>) => issuesOf(result).map((issue) => issue.code);

/** Troca a linha de conteúdo do snapshot válido. */
const withContent = (content: Content): SnapshotLine[] =>
  buildSnapshotLines().map((line) =>
    line.type === 'content' ? { type: 'content', data: content } : line,
  );

const context = { authorIds: new Set([1]), taxonomyIds: new Set([1]), mediaIds: new Set([1]) };

describe('validateSnapshot', () => {
  it('aceita um snapshot válido e o devolve montado', () => {
    const result = validateSnapshot(buildSnapshotLines());
    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toMatchObject({
      header: { site: 'teste' },
      config: { siteId: 'teste' },
      contents: [{ id: 1 }],
    });
  });

  it('lança se receber recursos de outra versão (bug de quem chama)', () => {
    const resources: Resources = { ...RESOURCES, schemaVersion: 2 };
    expect(() => validateSnapshot(buildSnapshotLines(), resources)).toThrow(/versão 2/);
  });

  describe('estrutura (semantic.snapshot-structure)', () => {
    const [header, config, ...rest] = buildSnapshotLines() as [
      SnapshotLine,
      SnapshotLine,
      ...SnapshotLine[],
    ];
    const end = rest.pop() as SnapshotLine & { type: 'end' };
    const endWithoutConfig = { ...end, counts: { ...end.counts, config: 0 } };

    it.each([
      ['sem header', [config, ...rest, end]],
      ['sem end', [header, config, ...rest]],
      ['header fora do início', [config, header, ...rest, end]],
      ['end fora do fim', [header, end, config, ...rest, end]],
      ['duas configs', [header, config, config, ...rest, end]],
      ['sem config', [header, ...rest, endWithoutConfig]],
      ['contagem divergente (corte)', [header, config, ...rest.slice(0, -1), end]],
      ['vazio', []],
    ])('recusa %s', (_, broken) => {
      const result = validateSnapshot(broken);
      expect(result.ok).toBe(false);
      expect(codesOf(result)).toContain('semantic.snapshot-structure');
    });
  });

  describe('referências (semantic.references)', () => {
    it.each([
      ['autor', buildContent({ authorIds: [9] }), ['contents', 0, 'authorIds', 0]],
      ['taxonomia', buildContent({ taxonomyIds: [9] }), ['contents', 0, 'taxonomyIds', 0]],
      ['capa', buildContent({ coverMediaId: 9 }), ['contents', 0, 'coverMediaId']],
      [
        'mídia de bloco de imagem',
        buildContent({ blocks: [{ n: 1, type: 'image', mediaId: 9, alt: 'x' }] }),
        ['contents', 0, 'blocks', 0, 'mediaId'],
      ],
    ])('aponta %s inexistente', (_, content, path) => {
      const issues = issuesOf(validateSnapshot(withContent(content)));
      expect(issues).toContainEqual(expect.objectContaining({ code: 'semantic.references', path }));
    });

    it('aponta avatar de autor inexistente', () => {
      const lines = buildSnapshotLines().map((line) =>
        line.type === 'author' ? { ...line, data: { ...line.data, avatarMediaId: 9 } } : line,
      );
      expect(issuesOf(validateSnapshot(lines))).toContainEqual(
        expect.objectContaining({
          code: 'semantic.references',
          path: ['authors', 0, 'avatarMediaId'],
        }),
      );
    });
  });

  describe('unicidade (semantic.unique-slugs)', () => {
    const duplicate = (type: SnapshotLine['type'], change: (data: never) => unknown = (d) => d) => {
      const lines = buildSnapshotLines();
      const index = lines.findIndex((line) => line.type === type);
      const line = lines[index] as SnapshotLine & { data: never };
      const copy = { ...line, data: change(line.data) } as SnapshotLine;
      lines.splice(index + 1, 0, copy);
      const end = lines.at(-1);
      if (end?.type === 'end') end.counts[type as keyof typeof end.counts] += 1;
      return lines;
    };

    it.each([
      ['slug de conteúdo', duplicate('content', (d: Content) => ({ ...d, id: 2 }))],
      ['slug de autor', duplicate('author', (d: { id: number }) => ({ ...d, id: 2 }))],
      [
        'slug de taxonomia do mesmo tipo',
        duplicate('taxonomy', (d: { id: number }) => ({ ...d, id: 2 })),
      ],
      ['chave de menu', duplicate('menu', (d: { id: number }) => ({ ...d, id: 2 }))],
      ['origem de redirect', duplicate('redirect', (d: { id: number }) => ({ ...d, id: 2 }))],
      ['conteúdo na origem de um redirect', withContent(buildContent({ slug: 'antigo' }))],
    ])('aponta %s repetido', (_, lines) => {
      expect(codesOf(validateSnapshot(lines))).toContain('semantic.unique-slugs');
    });

    it('aceita o mesmo slug em tipos de taxonomia diferentes', () => {
      const lines = duplicate('taxonomy', (d: { id: number }) => ({ ...d, id: 2, kind: 'tag' }));
      expect(validateSnapshot(lines).ok).toBe(true);
    });
  });

  it('aponta n repetido no artigo (semantic.unique-block-n)', () => {
    const content = buildContent({
      blocks: [
        { n: 1, type: 'toc' },
        { n: 1, type: 'toc' },
      ],
    });
    expect(issuesOf(validateSnapshot(withContent(content)))).toContainEqual(
      expect.objectContaining({
        code: 'semantic.unique-block-n',
        path: ['contents', 0, 'blocks', 1, 'n'],
      }),
    );
  });

  describe('recursos suportados (semantic.supported-resources)', () => {
    it('aponta variante de imagem faltando no perfil', () => {
      const media = buildMedia(1);
      const lines = buildSnapshotLines().map((line) =>
        line.type === 'media'
          ? { ...line, data: { ...media, variants: media.variants.slice(1) } }
          : line,
      );
      expect(issuesOf(validateSnapshot(lines))).toContainEqual(
        expect.objectContaining({
          code: 'semantic.supported-resources',
          path: ['media', 0, 'variants'],
        }),
      );
    });

    it('ignora variantes extras fora do perfil', () => {
      const media = buildMedia(1);
      const extra = {
        ...media,
        variants: [...media.variants, { width: 3840, format: 'jxl', path: 'x.jxl' }],
      };
      const lines = buildSnapshotLines().map((line) =>
        line.type === 'media' ? { ...line, data: extra } : line,
      );
      expect(validateSnapshot(lines).ok).toBe(true);
    });

    describe('mídia menor que a maior largura do perfil', () => {
      const variantsOf = (id: number, widths: number[]) =>
        widths.flatMap((width) =>
          RESOURCES.imageProfile.formats.map((format) => ({
            width,
            format,
            path: `teste/m${id}-${width}.${format}`,
          })),
        );
      const withMedia = (media: ReturnType<typeof buildMedia>): SnapshotLine[] =>
        buildSnapshotLines().map((line) =>
          line.type === 'media' ? { ...line, data: media } : line,
        );

      it('original de 800 px: bastam 320 e 640 nos dois formatos', () => {
        const media = buildMedia(1, {
          width: 800,
          height: 600,
          variants: variantsOf(1, [320, 640]),
        });
        expect(validateSnapshot(withMedia(media)).ok).toBe(true);
        expect(validateMedia(media).ok).toBe(true);
      });

      it('original de 800 px sem a 640: recusa', () => {
        const media = buildMedia(1, { width: 800, height: 600, variants: variantsOf(1, [320]) });
        expect(issuesOf(validateSnapshot(withMedia(media)))).toContainEqual(
          expect.objectContaining({
            code: 'semantic.supported-resources',
            message: 'Mídia 1 sem a variante 640w avif do perfil de imagem',
          }),
        );
        expect(validateMedia(media).ok).toBe(false);
      });

      it('original de 200 px: uma variante de 200 por formato', () => {
        expect(requiredImageWidths(200, RESOURCES)).toEqual([200]);
        const media = buildMedia(1, { width: 200, height: 100, variants: variantsOf(1, [200]) });
        expect(validateSnapshot(withMedia(media)).ok).toBe(true);
        const missing = { ...media, variants: variantsOf(1, [320]) };
        expect(codesOf(validateMedia(missing))).toContain('semantic.supported-resources');
      });

      it('original maior que o perfil exige todas as larguras', () => {
        expect(requiredImageWidths(2560, RESOURCES)).toEqual(RESOURCES.imageProfile.widths);
        expect(requiredImageWidths(1920, RESOURCES)).toEqual(RESOURCES.imageProfile.widths);
      });
    });

    it('usa os recursos da release do site, não os do código atual', () => {
      const older: Resources = { ...RESOURCES, blockTypes: ['text', 'toc', 'quote', 'faq'] };
      expect(issuesOf(validateSnapshot(buildSnapshotLines(), older))).toContainEqual(
        expect.objectContaining({ path: ['contents', 0, 'blocks', 1, 'type'] }),
      );
    });
  });
});

describe('validateSiteConfig', () => {
  it('aceita presets e variantes suportados', () => {
    expect(validateSiteConfig(buildConfig()).ok).toBe(true);
  });

  it.each([
    [
      'preset desconhecido',
      buildConfig({ presets: { ...buildConfig().presets, home: 'mosaico' } }),
      ['presets', 'home'],
    ],
    [
      'variante desconhecida',
      buildConfig({ variants: { articleCard: 'compacto' } }),
      ['variants', 'articleCard'],
    ],
  ])('aponta %s', (_, config, path) => {
    expect(issuesOf(validateSiteConfig(config))).toEqual([
      expect.objectContaining({ code: 'semantic.supported-resources', path }),
    ]);
  });

  it('aponta tipo de página que a release não conhece', () => {
    const older: Resources = { ...RESOURCES, presets: { home: ['padrao'] } };
    expect(issuesOf(validateSiteConfig(buildConfig(), older)).map((i) => i.path)).toEqual([
      ['presets', 'artigo'],
      ['presets', 'categoria'],
      ['presets', 'autor'],
    ]);
  });
});

describe('validateContent', () => {
  it('aceita um conteúdo com referências conhecidas', () => {
    expect(validateContent(buildContent(), context)).toEqual({ ok: true, value: buildContent() });
  });

  it('junta problemas de referências, n repetido e tipo de bloco', () => {
    const content = buildContent({
      authorIds: [2],
      blocks: [
        { n: 1, type: 'faq', items: [{ question: 'P?', answer: [{ type: 'text', text: 'R' }] }] },
        { n: 1, type: 'toc' },
      ],
    });
    const older: Resources = { ...RESOURCES, blockTypes: ['text', 'toc'] };
    expect(codesOf(validateContent(content, context, older)).sort()).toEqual([
      'semantic.references',
      'semantic.supported-resources',
      'semantic.unique-block-n',
    ]);
  });
});
