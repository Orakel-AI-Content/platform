// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SECTION_TITLE_CLASS } from '@/components/shared/sectionText.ts';
import type { ContentData } from '@/db/schema/index.ts';

import type { MediaItem } from '@/components/media/MediaLibrary';

import { ContentVersionView, type VersionReferences } from './ContentVersionView.tsx';

// Leitura de uma versão (#44): os cinco tipos de bloco, sem nenhum controle de edição; em
// cartões, com a hierarquia de títulos das outras telas (#372); autores, taxonomias e mídias
// pelo nome e pela miniatura, e "removido (ID n)" no que não existe mais (#593).

afterEach(cleanup);

const data: ContentData = {
  kind: 'article',
  slug: 'guia-de-uso',
  title: 'Guia de uso',
  authorIds: [1],
  taxonomyIds: [],
  publishedAt: '2026-10-01T12:00:00Z',
  blocks: [
    {
      n: 1,
      type: 'text',
      content: [
        { type: 'heading', level: 2, children: [{ type: 'text', text: 'Primeiros passos' }] },
        {
          type: 'paragraph',
          children: [
            { type: 'text', text: 'Leia com ' },
            { type: 'text', text: 'atenção', marks: ['bold', 'italic'] },
          ],
        },
        { type: 'list', ordered: false, items: [[{ type: 'text', text: 'Item um' }]] },
      ],
    },
    { n: 2, type: 'toc', title: 'Neste guia' },
    {
      n: 4,
      type: 'quote',
      content: [{ type: 'text', text: 'Simples é melhor.' }],
      attribution: 'Alguém',
    },
    { n: 5, type: 'image', mediaId: 9, alt: 'Tela inicial' },
    {
      n: 6,
      type: 'faq',
      items: [{ question: 'Funciona offline?', answer: [{ type: 'text', text: 'Não.' }] }],
    },
  ],
};

const thumbnail = (id: number, width: number, height: number): MediaItem => ({
  id,
  width,
  height,
  sources: [{ type: 'image/avif', url: `https://media.exemplo-a.example.com/${id}.avif` }],
  src: `https://media.exemplo-a.example.com/${id}.jpg`,
});

const references: VersionReferences = {
  authors: new Map([[1, 'Ana Souza']]),
  taxonomies: new Map([
    [6, 'Hortas (categoria)'],
    [7, 'Vaso (tag)'],
  ]),
  media: new Map([
    [3, thumbnail(3, 1600, 900)],
    [9, thumbnail(9, 800, 600)],
  ]),
};

const none: VersionReferences = { authors: new Map(), taxonomies: new Map(), media: new Map() };

/** O valor (`dd`) do campo de rótulo `label`. */
function field(label: string) {
  return screen.getByText(label, { selector: 'dt' }).nextElementSibling as HTMLElement;
}

describe('visualização de versão', () => {
  it('mostra o título e o texto de cada bloco', () => {
    render(<ContentVersionView data={data} timeZone="America/Sao_Paulo" references={references} />);

    expect(screen.getByText('Guia de uso')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Primeiros passos' })).toBeTruthy();
    expect(screen.getByText('atenção').closest('strong')).toBeTruthy();
    expect(screen.getByText('Item um')).toBeTruthy();
    expect(screen.getByText('Neste guia')).toBeTruthy();
    expect(screen.getByText('Simples é melhor.')).toBeTruthy();
    expect(screen.getByText('Tela inicial')).toBeTruthy();
    expect(screen.getByText('Funciona offline?')).toBeTruthy();
    expect(screen.getByText('Não.')).toBeTruthy();
    expect(screen.getByText('FAQ · bloco 6')).toBeTruthy();
  });

  it('mostra a data de publicação no formato e no fuso do site, não em ISO', () => {
    render(<ContentVersionView data={data} timeZone="America/Sao_Paulo" references={references} />);

    expect(screen.getByText('01/10/2026, 09:00 BRT')).toBeTruthy();
    expect(screen.queryByText(data.publishedAt)).toBeNull();
  });

  it('não tem nenhum controle de edição', () => {
    const { container } = render(
      <ContentVersionView data={data} timeZone="America/Sao_Paulo" references={references} />,
    );

    for (const role of ['textbox', 'button', 'checkbox', 'combobox']) {
      expect(screen.queryAllByRole(role)).toEqual([]);
    }
    expect(container.querySelector('form, input, textarea, select, [contenteditable]')).toBeNull();
  });

  it('põe "Dados" e cada bloco num cartão, sem a grade rótulo/valor antiga', () => {
    const { container } = render(
      <ContentVersionView data={data} timeZone="America/Sao_Paulo" references={references} />,
    );

    expect(container.querySelectorAll('.card')).toHaveLength(1 + data.blocks.length);
    expect(
      container.querySelector('.rounded-xl.border, [class*="grid-cols-[auto_1fr]"]'),
    ).toBeNull();
  });

  it('não pula nível de título, com a classe de título das outras telas', () => {
    const { container } = render(
      <>
        <h1>Versão 1</h1>
        <ContentVersionView
          timeZone="America/Sao_Paulo"
          references={references}
          data={{
            ...data,
            blocks: [
              {
                n: 1,
                type: 'text',
                content: [
                  { type: 'heading', level: 3, children: [{ type: 'text', text: 'Solto' }] },
                  { type: 'heading', level: 2, children: [{ type: 'text', text: 'Seção' }] },
                  { type: 'heading', level: 3, children: [{ type: 'text', text: 'Subseção' }] },
                ],
              },
              ...data.blocks.slice(1),
            ],
          }}
        />
      </>,
    );

    const levels = [...container.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((heading) =>
      Number(heading.tagName[1]),
    );
    levels.forEach((level, index) => {
      if (index > 0) expect(level - levels[index - 1]!).toBeLessThanOrEqual(1);
    });
    expect(screen.getByRole('heading', { name: 'Solto' }).tagName).toBe('H4');
    expect(screen.getByRole('heading', { name: 'Seção' }).tagName).toBe('H4');
    expect(screen.getByRole('heading', { name: 'Subseção' }).tagName).toBe('H5');

    const sections = screen.getAllByRole('heading', { level: 2 });
    const blocks = screen.getAllByRole('heading', { level: 3 });
    expect(sections.map((h) => h.textContent)).toEqual(['Dados', 'Blocos']);
    expect(blocks).toHaveLength(data.blocks.length);
    for (const heading of [...sections, ...blocks]) {
      expect(heading.className).toBe(SECTION_TITLE_CLASS);
    }
  });

  it('mostra os nomes dos autores e das taxonomias, com o tipo, sem "(IDs)" no rótulo', () => {
    render(
      <ContentVersionView
        data={{ ...data, taxonomyIds: [6, 7] }}
        timeZone="America/Sao_Paulo"
        references={references}
      />,
    );

    expect(field('Autores').textContent).toBe('Ana Souza');
    expect(field('Taxonomias').textContent).toBe('Hortas (categoria), Vaso (tag)');
    expect(screen.queryByText(/\(IDs\)|\(mídia\)/)).toBeNull();
  });

  it('mostra a capa e a imagem do bloco em miniatura, com as dimensões e alt vazio', () => {
    const { container } = render(
      <ContentVersionView
        data={{ ...data, coverMediaId: 3 }}
        timeZone="America/Sao_Paulo"
        references={references}
      />,
    );

    expect(field('Capa').textContent).toBe('Mídia 3 · 1600×900');
    expect(field('Capa').querySelector('img')?.getAttribute('src')).toBe(
      'https://media.exemplo-a.example.com/3.jpg',
    );
    expect(field('Mídia').textContent).toBe('Mídia 9 · 800×600');
    expect(field('Texto alternativo').textContent).toBe('Tela inicial');
    const images = [...container.querySelectorAll('img')];
    expect(images).toHaveLength(2);
    for (const image of images) expect(image.getAttribute('alt')).toBe('');
  });

  it('sem capa, mostra "—"', () => {
    render(<ContentVersionView data={data} timeZone="America/Sao_Paulo" references={references} />);

    expect(field('Capa').textContent).toBe('—');
  });

  it('autor, taxonomia e mídia que não existem mais aparecem como "removido (ID n)"', () => {
    const { container } = render(
      <ContentVersionView
        data={{ ...data, taxonomyIds: [13], coverMediaId: 3 }}
        timeZone="America/Sao_Paulo"
        references={none}
      />,
    );

    expect(field('Autores').textContent).toBe('removido (ID 1)');
    expect(field('Taxonomias').textContent).toBe('removido (ID 13)');
    expect(field('Capa').textContent).toBe('removido (ID 3)');
    expect(field('Mídia').textContent).toBe('removido (ID 9)');
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('FAQ · bloco 6')).toBeTruthy();
  });
});
