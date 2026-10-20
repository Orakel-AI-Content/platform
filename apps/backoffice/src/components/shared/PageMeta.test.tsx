// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { StateTag } from '@/components/sites/SiteStatus.tsx';
import { PageMeta } from './PageMeta.tsx';

// Linha de metadados sob o título (#368): itens separados por " · " decorativo, com espaço para
// a StateTag, e nada quando não há item.

afterEach(cleanup);

describe('linha de metadados', () => {
  it('separa os itens com " · ", escondido do leitor de tela', () => {
    const { container } = render(
      <PageMeta items={['Versão 3', 'Rascunho', 'Atualizada em 01/10/2026, 12:30 BRT']} />,
    );

    const line = container.firstElementChild as HTMLElement;
    expect(line.textContent).toBe('Versão 3·Rascunho·Atualizada em 01/10/2026, 12:30 BRT');
    const separators = line.querySelectorAll('[aria-hidden="true"]');
    expect(separators).toHaveLength(2);
    expect([...separators].every((separator) => separator.textContent === '·')).toBe(true);
    expect(line.className).toContain('text-sm');
    expect(line.className).toContain('text-gray-600');
    expect(line.className).toContain('dark:text-gray-400');
  });

  it('aceita a StateTag como item e ignora os vazios sem sobrar separador', () => {
    const { container } = render(
      <PageMeta
        items={[
          <StateTag key="estado" color="bg-success">
            Publicado
          </StateTag>,
          null,
          false,
          '',
          'Versão 4',
        ]}
      />,
    );

    expect(screen.getByText('Publicado')).toBeTruthy();
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1);
    expect(container.firstElementChild?.lastElementChild?.textContent).toBe('Versão 4');
  });

  it('sem itens, não desenha a linha', () => {
    const { container } = render(<PageMeta items={[null, undefined]} />);

    expect(container.innerHTML).toBe('');
  });
});
