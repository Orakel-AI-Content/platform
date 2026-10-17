// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Input } from './index.tsx';

// Input do Ecme (#207): classes do template por tamanho e estado, textarea, prefixo e sufixo
// por dentro do campo, e `aria-invalid` quando inválido.

afterEach(cleanup);

describe('Input', () => {
  it('padrão: input de texto com a classe base, tamanho md e foco em primary', () => {
    render(<Input aria-label="Título" />);

    const input = screen.getByRole('textbox', { name: 'Título' });
    expect(input.getAttribute('type')).toBe('text');
    expect(input.className).toContain('input');
    expect(input.className).toContain('input-md');
    expect(input.className).toContain('h-12');
    expect(input.className).toContain('focus:ring-primary');
    expect(input.hasAttribute('aria-invalid')).toBe(false);
  });

  it('textArea: renderiza <textarea> com as linhas pedidas', () => {
    render(<Input textArea rows={4} aria-label="Resumo" />);

    const textarea = screen.getByRole('textbox', { name: 'Resumo' });
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea.getAttribute('rows')).toBe('4');
    expect(textarea.className).toContain('input-textarea');
  });

  it('invalid: classe de erro, sem o foco em primary, e aria-invalid', () => {
    render(<Input invalid aria-label="Slug" />);

    const input = screen.getByRole('textbox', { name: 'Slug' });
    expect(input.className).toContain('input-invalid');
    expect(input.className).not.toContain('focus:ring-primary');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('disabled: atributo nativo e classe de desabilitado', () => {
    render(<Input disabled aria-label="Domínio" />);

    const input = screen.getByRole('textbox', { name: 'Domínio' });
    expect(input).toHaveProperty('disabled', true);
    expect(input.className).toContain('input-disabled');
  });

  it('prefixo e sufixo ficam no wrapper, que recebe o className', () => {
    render(<Input prefix="R$" suffix=",00" className="max-w-xs" aria-label="Preço" />);

    const input = screen.getByRole('textbox', { name: 'Preço' });
    const wrapper = input.parentElement!;
    expect(wrapper.className).toContain('input-wrapper');
    expect(wrapper.className).toContain('max-w-xs');
    expect(input.className).not.toContain('max-w-xs');
    expect(wrapper.querySelector('.input-suffix-start')?.textContent?.trim()).toBe('R$');
    expect(wrapper.querySelector('.input-suffix-end')?.textContent).toBe(',00');
  });

  it('value controlado sem valor vira string vazia; onChange chega', async () => {
    const onChange = vi.fn();
    render(<Input aria-label="Busca" value={undefined} onChange={onChange} />);

    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Busca' });
    expect(input.value).toBe('');
    await userEvent.type(input, 'a');
    expect(onChange).toHaveBeenCalled();
  });

  it('unstyle: sem as classes do template', () => {
    render(<Input unstyle aria-label="Livre" />);

    expect(screen.getByRole('textbox', { name: 'Livre' }).className).toBe('');
  });
});
