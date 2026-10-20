// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SECTION_TITLE_CLASS } from '@/components/shared/sectionText.ts';
import type { ContentData } from '@/db/schema/index.ts';

import { ContentVersionView } from './ContentVersionView.tsx';

// Leitura de uma versão (#44): os cinco tipos de bloco, sem nenhum controle de edição; em
// cartões, com a hierarquia de títulos das outras telas (#372).

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

describe('visualização de versão', () => {
  it('mostra o título e o texto de cada bloco', () => {
    render(<ContentVersionView data={data} />);

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

  it('não tem nenhum controle de edição', () => {
    const { container } = render(<ContentVersionView data={data} />);

    for (const role of ['textbox', 'button', 'checkbox', 'combobox']) {
      expect(screen.queryAllByRole(role)).toEqual([]);
    }
    expect(container.querySelector('form, input, textarea, select, [contenteditable]')).toBeNull();
  });

  it('põe "Dados" e cada bloco num cartão, sem a grade rótulo/valor antiga', () => {
    const { container } = render(<ContentVersionView data={data} />);

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
});
