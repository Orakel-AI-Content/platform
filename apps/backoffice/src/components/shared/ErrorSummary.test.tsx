// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorSummary } from './ErrorSummary.tsx';

// Resumo de erros no Alert do Ecme (#325): contêiner role="alert" sempre montado.

afterEach(cleanup);

describe('ErrorSummary', () => {
  it('sem erro, a região role="alert" existe vazia e sem Alert', () => {
    render(<ErrorSummary lines={[]} />);

    const region = screen.getByRole('alert');
    expect(region.textContent).toBe('');
    expect(region.querySelector('.alert')).toBeNull();
  });

  it('mostra as linhas e os itens num Alert danger dentro da região', () => {
    render(
      <ErrorSummary
        lines={['Sessão inválida; entre de novo.']}
        items={[{ key: 'name', text: 'Nome: obrigatório', onFocus: () => undefined }]}
      />,
    );

    const region = screen.getByRole('alert');
    const alert = region.querySelector('.alert');
    expect(alert).not.toBeNull();
    expect(alert!.className).toContain('bg-error-subtle');
    expect(within(region).getByText('Sessão inválida; entre de novo.')).toBeTruthy();
    expect(within(region).getByText('Corrija os campos destacados:')).toBeTruthy();
  });

  it('item com onFocus é botão que o chama; sem onFocus, só texto', async () => {
    const onFocus = vi.fn();
    render(
      <ErrorSummary
        lines={[]}
        items={[
          { key: 'name', text: 'Nome: obrigatório', onFocus },
          { key: 'items', text: 'Itens: ao menos um' },
        ]}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Nome: obrigatório' }));
    expect(onFocus).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Itens: ao menos um' })).toBeNull();
    expect(screen.getByText('Itens: ao menos um')).toBeTruthy();
  });
});
