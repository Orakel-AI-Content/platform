// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Checkbox } from './index.tsx';
import type { CheckboxGroupValue } from './index.tsx';

// Checkbox do Ecme (#208): <input type="checkbox"> nativo dentro do <label>, `indeterminate`
// também na propriedade do DOM e o Group como `role="group"`.

afterEach(cleanup);

describe('Checkbox', () => {
  it('o texto nomeia o campo; clique alterna e chama onChange com o estado novo', async () => {
    const onChange = vi.fn();
    render(<Checkbox onChange={onChange}>Destaque</Checkbox>);

    const checkbox = screen.getByRole('checkbox', { name: 'Destaque' });
    expect(checkbox).toHaveProperty('checked', false);
    expect(checkbox.className).toContain('checkbox');
    expect(checkbox.className).toContain('text-primary');
    await userEvent.click(checkbox);
    expect(checkbox).toHaveProperty('checked', true);
    expect(onChange).toHaveBeenLastCalledWith(true, expect.anything());
  });

  it('Espaço alterna o campo em foco', async () => {
    render(<Checkbox defaultChecked>Publicado</Checkbox>);

    const checkbox = screen.getByRole('checkbox', { name: 'Publicado' });
    checkbox.focus();
    await userEvent.keyboard(' ');
    expect(checkbox).toHaveProperty('checked', false);
  });

  it('controlado: segue o checked da prop', () => {
    const { rerender } = render(<Checkbox checked={false} aria-label="Ativo" />);
    expect(screen.getByRole('checkbox', { name: 'Ativo' })).toHaveProperty('checked', false);
    rerender(<Checkbox checked aria-label="Ativo" />);
    expect(screen.getByRole('checkbox', { name: 'Ativo' })).toHaveProperty('checked', true);
  });

  it('indeterminate liga a propriedade nativa e troca o ícone', () => {
    const { rerender } = render(
      <Checkbox checked indeterminate>
        Todos
      </Checkbox>,
    );

    const checkbox = screen.getByRole<HTMLInputElement>('checkbox', { name: 'Todos' });
    expect(checkbox.indeterminate).toBe(true);
    expect(checkbox.parentElement?.querySelector('svg path')?.getAttribute('d')).toMatch(/^M5 10/);
    expect(checkbox.parentElement?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');

    rerender(<Checkbox checked>Todos</Checkbox>);
    expect(checkbox.indeterminate).toBe(false);
  });

  it('disabled: atributo nativo, classe de desabilitado e sem onChange', async () => {
    const onChange = vi.fn();
    render(
      <Checkbox disabled onChange={onChange}>
        Bloqueado
      </Checkbox>,
    );

    const checkbox = screen.getByRole('checkbox', { name: 'Bloqueado' });
    expect(checkbox).toHaveProperty('disabled', true);
    expect(checkbox.className).toContain('disabled');
    expect(checkbox.closest('label')?.className).toContain('disabled');
    await userEvent.click(checkbox);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('repassa o ref ao <input>', () => {
    let element: HTMLInputElement | null = null;
    render(
      <Checkbox
        ref={(node) => {
          element = node;
        }}
        aria-label="Com ref"
      />,
    );

    expect(element).toBe(screen.getByRole('checkbox', { name: 'Com ref' }));
  });
});

describe('Checkbox.Group', () => {
  function Categorias({ onChange }: { onChange: (value: CheckboxGroupValue) => void }) {
    const [value, setValue] = useState<CheckboxGroupValue>(['noticias']);
    return (
      <Checkbox.Group
        aria-label="Categorias"
        name="categorias"
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
        vertical
      >
        <Checkbox value="noticias">Notícias</Checkbox>
        <Checkbox value="guias">Guias</Checkbox>
      </Checkbox.Group>
    );
  }

  it('role="group" com nome, valor inicial e o nome do grupo nos campos', () => {
    render(<Categorias onChange={vi.fn()} />);

    const group = screen.getByRole('group', { name: 'Categorias' });
    expect(group.className).toContain('flex-col');
    expect(screen.getByRole('checkbox', { name: 'Notícias' })).toHaveProperty('checked', true);
    expect(screen.getByRole('checkbox', { name: 'Guias' })).toHaveProperty('checked', false);
    expect(screen.getByRole('checkbox', { name: 'Guias' }).getAttribute('name')).toBe('categorias');
  });

  it('marcar e desmarcar acrescenta e tira o valor', async () => {
    const onChange = vi.fn();
    render(<Categorias onChange={onChange} />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Guias' }));
    expect(onChange).toHaveBeenLastCalledWith(['noticias', 'guias']);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Notícias' }));
    expect(onChange).toHaveBeenLastCalledWith(['guias']);
    expect(screen.getByRole('checkbox', { name: 'Notícias' })).toHaveProperty('checked', false);
  });
});
