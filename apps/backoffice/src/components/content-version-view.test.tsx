// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { ContentData } from '@/db/schema/index.ts';

import { ContentVersionView } from './content-version-view.tsx';

// Leitura de uma versão (#44): os cinco tipos de bloco, sem nenhum controle de edição.

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

  it('usa só os tokens do Ecme, sem as cores do shadcn (#271)', () => {
    const { container } = render(<ContentVersionView data={data} />);

    expect(container.innerHTML).not.toMatch(/muted-foreground|border-border|destructive/);
  });
});
