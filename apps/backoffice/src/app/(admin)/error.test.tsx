// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AdminError from './error.tsx';

// Tela de erro de (admin) (#77): frase, código para os logs, "Tentar de novo" e nada da
// mensagem da exceção.

afterEach(cleanup);

const failure = Object.assign(new Error('senha do banco: segredo'), { digest: '1234567890' });

describe('tela de erro', () => {
  it('mostra o título, a frase e o código do erro, sem a mensagem da exceção', () => {
    render(<AdminError error={failure} retry={() => undefined} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Algo deu errado' })).toBeTruthy();
    expect(screen.getByText(/Código do erro: 1234567890/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('segredo');
  });

  it('"Tentar de novo" refaz o trecho pelo retry, também pelo teclado', async () => {
    const retry = vi.fn();
    render(<AdminError error={failure} retry={retry} />);
    const user = userEvent.setup();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Tentar de novo' }));
    await user.keyboard('{Enter}');
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('sem digest, não mostra a linha do código', () => {
    render(<AdminError error={new Error('x')} retry={() => undefined} />);
    expect(screen.queryByText(/Código do erro/)).toBeNull();
  });
});
