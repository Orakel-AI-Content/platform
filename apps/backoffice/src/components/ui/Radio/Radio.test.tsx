// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Radio } from './index.tsx';
import type { RadioValue } from './index.tsx';

// Radio do Ecme (#315): <input type="radio"> nativo dentro do <label> e o Group como
// `role="radiogroup"`, com um `name` comum (gerado, se faltar) para as setas trocarem a escolha.

afterEach(cleanup);

function Tema({ onChange, name }: { onChange: (value: RadioValue) => void; name?: string }) {
  const [value, setValue] = useState<RadioValue>('claro');
  return (
    <Radio.Group
      aria-label="Tema"
      name={name}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    >
      <Radio value="claro">Claro</Radio>
      <Radio value="escuro">Escuro</Radio>
      <Radio value="sistema">Sistema</Radio>
    </Radio.Group>
  );
}

describe('Radio', () => {
  it('o texto nomeia o campo e o círculo fica aria-hidden', () => {
    render(<Radio value="a">Opção A</Radio>);

    const radio = screen.getByRole('radio', { name: 'Opção A' });
    expect(radio.className).toContain('radio');
    expect(radio.className).toContain('text-primary');
    expect(radio.parentElement?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('disabled: atributo nativo, classe de desabilitado e sem onChange', async () => {
    const onChange = vi.fn();
    render(
      <Radio value="x" disabled onChange={onChange}>
        Bloqueada
      </Radio>,
    );

    const radio = screen.getByRole('radio', { name: 'Bloqueada' });
    expect(radio).toHaveProperty('disabled', true);
    expect(radio.className).toContain('disabled');
    await userEvent.click(radio);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Radio.Group', () => {
  it('role="radiogroup" com nome, valor inicial e o nome do grupo nos campos', () => {
    render(<Tema onChange={vi.fn()} name="tema" />);

    expect(screen.getByRole('radiogroup', { name: 'Tema' }).className).toContain('radio-group');
    expect(screen.getByRole('radio', { name: 'Claro' })).toHaveProperty('checked', true);
    expect(screen.getByRole('radio', { name: 'Escuro' })).toHaveProperty('checked', false);
    expect(screen.getByRole('radio', { name: 'Sistema' }).getAttribute('name')).toBe('tema');
  });

  it('sem name, gera um comum a todas as opções', () => {
    render(<Tema onChange={vi.fn()} />);

    const names = screen.getAllByRole('radio').map((radio) => radio.getAttribute('name'));
    expect(names[0]).toBeTruthy();
    expect(new Set(names).size).toBe(1);
  });

  it('clique escolhe a opção e chama onChange com o valor', async () => {
    const onChange = vi.fn();
    render(<Tema onChange={onChange} />);

    await userEvent.click(screen.getByRole('radio', { name: 'Sistema' }));
    expect(onChange).toHaveBeenLastCalledWith('sistema');
    expect(screen.getByRole('radio', { name: 'Sistema' })).toHaveProperty('checked', true);
    expect(screen.getByRole('radio', { name: 'Claro' })).toHaveProperty('checked', false);
  });

  it('as setas trocam a escolha dentro do grupo', async () => {
    const onChange = vi.fn();
    render(<Tema onChange={onChange} />);

    screen.getByRole('radio', { name: 'Claro' }).focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(onChange).toHaveBeenLastCalledWith('escuro');
    expect(screen.getByRole('radio', { name: 'Escuro' })).toHaveProperty('checked', true);
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Escuro' }));
  });

  it('vertical e disabled do grupo chegam às opções', () => {
    render(
      <Radio.Group aria-label="Formato" vertical disabled value="texto">
        <Radio value="texto">Texto</Radio>
        <Radio value="video">Vídeo</Radio>
      </Radio.Group>,
    );

    expect(screen.getByRole('radiogroup', { name: 'Formato' }).className).toContain('vertical');
    expect(screen.getByRole('radio', { name: 'Vídeo' })).toHaveProperty('disabled', true);
  });
});
