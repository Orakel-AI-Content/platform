// Snapshot NDJSON sintético com N artigos, válido pelo content-model v1, para as medições
// da L3 (100, 1.000 e 5.000 artigos). Parte da configuração do exemplo-a; o conteúdo é
// determinístico (mesmo N, mesmo arquivo).
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

type Line = Record<string, unknown>;

const text = (value: string) => ({ type: 'text', text: value });
const paragraph = (value: string) => ({ type: 'paragraph', children: [text(value)] });

function media(id: number, site: string) {
  const widths = [320, 640, 960, 1280, 1920];
  return {
    id,
    width: 1920,
    height: 1080,
    variants: widths.flatMap((width) =>
      ['avif', 'webp'].map((format) => ({
        width,
        format,
        path: `${site}/sint-${id}-${width}.${format}`,
      })),
    ),
  };
}

export function syntheticSnapshot(articles: number, site = 'exemplo-a'): string {
  const fixture = readFileSync(
    require.resolve(`@orakel/content-model/fixtures/v1/${site}.ndjson`),
    'utf8',
  )
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Line);
  const config = fixture.find((line) => line.type === 'config')!;
  const menus = fixture.filter((line) => line.type === 'menu');

  const categories = 10;
  const tags = 30;
  const authors = 5;
  const mediaCount = 20;
  const lines: Line[] = [
    { type: 'header', schemaVersion: 1, site, pendingChangeIds: [1] },
    config,
    ...Array.from({ length: authors }, (_, i) => ({
      type: 'author',
      data: {
        id: i + 1,
        slug: `autor-${i + 1}`,
        name: `Autor ${i + 1}`,
        bio: 'Escreve para o site sintético.',
      },
    })),
    ...Array.from({ length: categories + tags }, (_, i) => ({
      type: 'taxonomy',
      data:
        i < categories
          ? { id: i + 1, kind: 'category', slug: `categoria-${i + 1}`, name: `Categoria ${i + 1}` }
          : {
              id: i + 1,
              kind: 'tag',
              slug: `tag-${i + 1 - categories}`,
              name: `Tag ${i + 1 - categories}`,
            },
    })),
    ...menus,
    ...Array.from({ length: mediaCount }, (_, i) => ({ type: 'media', data: media(i + 1, site) })),
    ...Array.from({ length: articles }, (_, i) => {
      const id = i + 1;
      const day = String((i % 28) + 1).padStart(2, '0');
      const month = String((Math.floor(i / 28) % 12) + 1).padStart(2, '0');
      return {
        type: 'content',
        data: {
          id,
          kind: 'article',
          slug: `artigo-sintetico-${id}`,
          title: `Artigo sintético ${id}`,
          description: `Resumo do artigo sintético ${id}.`,
          authorIds: [(i % authors) + 1],
          taxonomyIds: [(i % categories) + 1, categories + (i % tags) + 1],
          coverMediaId: (i % mediaCount) + 1,
          publishedAt: `2026-${month}-${day}T10:00:00-03:00`,
          blocks: [
            { n: 1, type: 'toc' },
            {
              n: 2,
              type: 'text',
              content: [
                { type: 'heading', level: 2, children: [text('Introdução')] },
                paragraph(
                  'Parágrafo de abertura com algumas frases para o índice de busca. '.repeat(6),
                ),
                { type: 'heading', level: 2, children: [text('Passo a passo')] },
                {
                  type: 'list',
                  ordered: true,
                  items: [[text('Primeiro')], [text('Segundo')], [text('Terceiro')]],
                },
                paragraph(
                  'Mais um parágrafo com conteúdo de exemplo e termos variados. '.repeat(8),
                ),
              ],
            },
            {
              n: 3,
              type: 'image',
              mediaId: ((i + 7) % mediaCount) + 1,
              alt: `Ilustração do artigo ${id}`,
            },
            {
              n: 4,
              type: 'faq',
              items: [{ question: 'Vale a pena?', answer: [text('Sim, para medir o build.')] }],
            },
          ],
        },
      };
    }),
  ];
  const count = (type: string) => lines.filter((line) => line.type === type).length;
  lines.push({
    type: 'end',
    counts: {
      config: 1,
      author: count('author'),
      taxonomy: count('taxonomy'),
      menu: count('menu'),
      media: count('media'),
      redirect: 0,
      content: count('content'),
    },
  });
  return `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`;
}

if (import.meta.main) {
  const [articles = '100', out = `/tmp/sintetico-${articles}.ndjson`] = process.argv.slice(2);
  writeFileSync(out, syntheticSnapshot(Number(articles)));
  console.log(out);
}
