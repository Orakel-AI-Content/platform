// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ROW_LINK_CLASS } from './rowLink.ts';
import { Truncated } from './Truncated.tsx';
import { TwoLines } from './TwoLines.tsx';

// Células compartilhadas das listas (#361): duas linhas, texto cortado com o inteiro em
// `title` e a classe do link principal da linha.

afterEach(cleanup);

describe('TwoLines', () => {
  it('mostra a linha principal e a secundária, menor', () => {
    render(<TwoLines secondary="exemplo.com">Exemplo</TwoLines>);

    expect(screen.getByText('Exemplo')).toBeTruthy();
    expect(screen.getByText('exemplo.com').className).toContain('text-xs');
  });

  it('sem secundária, só a principal', () => {
    const { container } = render(<TwoLines>Exemplo</TwoLines>);

    expect(container.querySelectorAll('span span')).toHaveLength(1);
  });
});

describe('Truncated', () => {
  it('corta na largura de quem usa e guarda o texto inteiro em title', () => {
    render(<Truncated text="Um texto longo demais" className="max-w-32" />);

    const text = screen.getByText('Um texto longo demais');
    expect(text.getAttribute('title')).toBe('Um texto longo demais');
    expect(text.className).toContain('truncate');
    expect(text.className).toContain('max-w-32');
  });
});

describe('ROW_LINK_CLASS', () => {
  it('é semibold e sublinhado, como o link da linha', () => {
    expect(ROW_LINK_CLASS.split(' ')).toEqual(
      expect.arrayContaining(['font-semibold', 'underline', 'hover:text-primary']),
    );
  });
});
