// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { InfoField, InfoList } from './InfoList.tsx';

// Lista de dados (#368): o `CustomerInfoField` do Ecme, com o rótulo em cima e o valor embaixo,
// em `dt`/`dd` semânticos, e o valor longo sem espaço quebrando dentro do item da grade.

afterEach(cleanup);

describe('lista de dados', () => {
  it('cada campo é um par termo e definição, na ordem', () => {
    render(
      <InfoList>
        <InfoField label="Domínio">exemplo-a.test</InfoField>
        <InfoField label="Identificador" className="tabular-nums">
          42
        </InfoField>
      </InfoList>,
    );

    const pairs = screen
      .getAllByRole('term')
      .map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]);
    expect(pairs).toEqual([
      ['Domínio', 'exemplo-a.test'],
      ['Identificador', '42'],
    ]);
    expect(screen.getAllByRole('definition')[1]?.className).toContain('tabular-nums');
  });

  it('rótulo no cinza do body, valor na cor dos títulos, e o valor quebra sem espaço', () => {
    render(
      <InfoList className="sm:grid-cols-2">
        <InfoField label="Slug">{'a'.repeat(120)}</InfoField>
      </InfoList>,
    );

    const list = screen.getByRole('term').closest('dl')!;
    expect(list.className).toContain('text-sm');
    expect(list.className).toContain('sm:grid-cols-2');
    // O rótulo herda o cinza do body (#398): sem cor própria.
    expect(screen.getByRole('term').className).not.toMatch(/text-gray-/);
    const value = screen.getByRole('definition');
    expect(value.className).toContain('text-gray-900');
    expect(value.className).toContain('dark:text-gray-100');
    // O item da grade encolhe (`min-w-0`) e o valor quebra em qualquer ponto.
    expect(value.className).toContain('wrap-anywhere');
    expect(value.parentElement?.className).toContain('min-w-0');
  });

  it('aceita um valor rico', () => {
    render(
      <InfoList>
        <InfoField label="Site">
          <a href="https://exemplo-a.test">exemplo-a.test</a>
        </InfoField>
      </InfoList>,
    );

    expect(screen.getByRole('definition').querySelector('a')?.getAttribute('href')).toBe(
      'https://exemplo-a.test',
    );
  });
});
