import { describe, expect, it } from 'vitest';

import { blockSummary, blockText, EMPTY_SUMMARY, SUMMARY_WORDS } from './block-summary.ts';

// Resumo de bloco recolhido (#135): o texto de cada tipo, nas primeiras palavras.

const text = (value: string) => ({ type: 'text', text: value });

describe('blockSummary', () => {
  it('texto: junta parágrafos, intertítulos, listas e links', () => {
    const block = {
      type: 'text',
      content: [
        { type: 'heading', level: 2, children: [text('Introdução')] },
        {
          type: 'paragraph',
          children: [text('Leia o'), { type: 'link', href: '/guia/', children: [text('guia')] }],
        },
        { type: 'list', ordered: false, items: [[text('um')], [text('dois')]] },
      ],
    };

    expect(blockSummary(block)).toBe('Introdução Leia o guia um dois');
  });

  it(`corta em ${SUMMARY_WORDS} palavras com reticências, e o texto inteiro fica em blockText`, () => {
    const long = Array.from({ length: 20 }, (_, index) => `p${index + 1}`).join(' ');
    const block = { type: 'text', content: [{ type: 'paragraph', children: [text(long)] }] };

    expect(blockSummary(block)).toBe(`${long.split(' ').slice(0, SUMMARY_WORDS).join(' ')}…`);
    expect(blockText(block)).toBe(long);
  });

  it('citação com autoria, sumário pelo título, FAQ pela primeira pergunta', () => {
    expect(
      blockSummary({ type: 'quote', content: [text('Menos é mais')], attribution: 'Mies' }),
    ).toBe('Menos é mais — Mies');
    expect(blockSummary({ type: 'toc', title: 'Neste guia' })).toBe('Neste guia');
    expect(
      blockSummary({
        type: 'faq',
        items: [
          { question: 'Funciona offline?', answer: [text('Não')] },
          { question: 'Outra?', answer: [text('Sim')] },
        ],
      }),
    ).toBe('Funciona offline?');
  });

  it('imagem: alternativo, senão a legenda, senão decorativa', () => {
    expect(blockSummary({ type: 'image', mediaId: 1, alt: 'Mesa posta' })).toBe('Mesa posta');
    expect(blockSummary({ type: 'image', mediaId: 1, caption: [text('Foto da mesa')] })).toBe(
      'Foto da mesa',
    );
    expect(blockSummary({ type: 'image', mediaId: 1, decorative: true })).toBe('Imagem decorativa');
  });

  it('sem texto (bloco novo, valor incompleto), "(vazio)"', () => {
    expect(blockSummary({ type: 'toc' })).toBe(EMPTY_SUMMARY);
    expect(blockSummary({ type: 'text', content: [] })).toBe(EMPTY_SUMMARY);
    expect(blockSummary({ type: 'faq', items: [] })).toBe(EMPTY_SUMMARY);
    expect(blockSummary(undefined)).toBe(EMPTY_SUMMARY);
  });
});
