// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import AsyncSelect from 'react-select/async';
import CreatableSelect from 'react-select/creatable';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { FormContainer, FormItem } from '../Form/index.tsx';
import { Select } from './index.tsx';

// Select do Ecme (#208) sobre o react-select: rótulo e erro do FormItem no combobox, instanceId
// estável, opção em foco marcada e as variantes async e creatable pelo `componentAs`.

type Opcao = { value: string; label: string };

const OPCOES: Opcao[] = [
  { value: 'noticias', label: 'Notícias' },
  { value: 'guias', label: 'Guias' },
  { value: 'resenhas', label: 'Resenhas' },
];

afterEach(cleanup);

// A mensagem do FormItem anima com o motion; o happy-dom rejeita a animação nativa cancelada.
beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

describe('Select', () => {
  it('no FormItem, o rótulo nomeia o combobox', () => {
    render(
      <FormItem label="Categoria">
        <Select options={OPCOES} placeholder="Escolha" />
      </FormItem>,
    );

    const combobox = screen.getByLabelText('Categoria');
    expect(combobox.getAttribute('role')).toBe('combobox');
    expect(combobox.id).toMatch(/-control$/);
    expect(combobox.hasAttribute('aria-invalid')).toBe(false);
  });

  it('no FormItem inválido: aria-invalid e aria-errormessage apontando para a mensagem', () => {
    render(
      <FormItem label="Categoria" invalid errorMessage="Escolha uma categoria">
        <Select options={OPCOES} />
      </FormItem>,
    );

    const combobox = screen.getByLabelText('Categoria');
    expect(combobox.getAttribute('aria-invalid')).toBe('true');
    const errorId = combobox.getAttribute('aria-errormessage')!;
    expect(document.getElementById(errorId)?.textContent).toBe('Escolha uma categoria');
    expect(document.querySelector('.select-control')?.className).toContain('bg-error-subtle');
  });

  it('instanceId: o dado vence; sem ele, um id estável do useId', () => {
    const { container, unmount } = render(
      <Select options={OPCOES} instanceId="categoria" aria-label="Categoria" />,
    );
    expect(container.querySelector('#react-select-categoria-input')).toBeTruthy();
    unmount();

    render(<Select options={OPCOES} aria-label="Outra" />);
    expect(screen.getByRole('combobox', { name: 'Outra' }).id).toMatch(/^react-select-select-/);
  });

  it('placeholder em gray-600/gray-300 e tamanho do FormContainer', () => {
    render(
      <FormContainer size="sm">
        <FormItem label="Categoria">
          <Select options={OPCOES} placeholder="Escolha" />
        </FormItem>
      </FormContainer>,
    );

    const placeholder = screen.getByText('Escolha');
    expect(placeholder.className).toContain('text-gray-600');
    expect(placeholder.className).toContain('dark:text-gray-300');
    expect(document.querySelector('.select')?.className).toContain('select-sm');
    expect(document.querySelector('.select-control')?.className).toContain('min-h-10');
  });

  it('setas marcam a opção em foco; Enter escolhe e mostra o valor', async () => {
    const onChange = vi.fn();
    render(<Select options={OPCOES} aria-label="Categoria" onChange={onChange} />);

    const combobox = screen.getByRole('combobox', { name: 'Categoria' });
    combobox.focus();
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{ArrowDown}');
    const guias = screen.getByText('Guias').closest('.select-option')!;
    expect(guias.className).toContain('select-option-focused');
    expect(screen.getByText('Notícias').closest('.select-option')?.className).not.toContain(
      'select-option-focused',
    );

    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith(OPCOES[1], expect.anything());
    expect(document.querySelector('.select-single-value')?.textContent).toBe('Guias');
  });

  it('opção escolhida em primary, com o ícone oculto do leitor de tela', async () => {
    render(<Select options={OPCOES} aria-label="Categoria" defaultValue={OPCOES[0]} />);

    screen.getByRole('combobox', { name: 'Categoria' }).focus();
    await userEvent.keyboard('{ArrowDown}');
    const option = document.querySelectorAll('.select-option')[0]!;
    expect(option.className).toContain('text-primary');
    expect(option.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('async: carrega as opções do loadOptions', async () => {
    const loadOptions = vi.fn((input: string) =>
      Promise.resolve(OPCOES.filter((option) => option.label.toLowerCase().includes(input))),
    );
    render(
      <Select<Opcao> componentAs={AsyncSelect} loadOptions={loadOptions} aria-label="Busca" />,
    );

    await userEvent.type(screen.getByRole('combobox', { name: 'Busca' }), 'gui');
    await waitFor(() => expect(screen.getByText('Guias')).toBeTruthy());
    expect(loadOptions).toHaveBeenCalled();
  });

  it('creatable: um valor novo vira opção com Enter', async () => {
    const onChange = vi.fn();
    render(
      <Select<Opcao>
        componentAs={CreatableSelect}
        options={OPCOES}
        aria-label="Tag"
        onChange={onChange}
      />,
    );

    await userEvent.type(screen.getByRole('combobox', { name: 'Tag' }), 'Entrevistas');
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ value: 'Entrevistas' }),
      expect.anything(),
    );
  });
});
