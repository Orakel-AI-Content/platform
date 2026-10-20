// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MediaGrid } from './MediaGrid.tsx';

// Grade de miniaturas (#374): a lista com o nome de quem usa, os itens de quem usa e um único
// tamanho de coluna.

afterEach(cleanup);

describe('grade de miniaturas', () => {
  it('é uma lista com o nome passado e os itens de quem usa', () => {
    render(
      <MediaGrid label="Imagens do site">
        <li>Um</li>
        <li>Dois</li>
      </MediaGrid>,
    );

    const list = screen.getByRole('list', { name: 'Imagens do site' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Um', 'Dois']);
  });

  it('tem um único tamanho de coluna e aceita classes de quem usa', () => {
    render(
      <MediaGrid label="Imagens da biblioteca" className="mt-2">
        <li>Um</li>
      </MediaGrid>,
    );

    const { className } = screen.getByRole('list', { name: 'Imagens da biblioteca' });
    expect(className).toContain('grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]');
    expect(className.match(/minmax\(/g)).toHaveLength(1);
    expect(className).toContain('mt-2');
  });
});
