// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorScreen } from './ErrorScreen.tsx';

// Conteúdo da tela de erro (#77, #380), comum ao error.tsx de (admin) e ao global-error.tsx:
// título, só o digest para os logs e "Tentar de novo" chamando o retry.

afterEach(cleanup);

describe('ErrorScreen', () => {
  it('com digest: título e o código do erro', () => {
    render(<ErrorScreen digest="1234567890" retry={() => undefined} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Algo deu errado' })).toBeTruthy();
    expect(screen.getByText('Código do erro: 1234567890')).toBeTruthy();
  });

  it('sem digest, não mostra a linha do código', () => {
    render(<ErrorScreen retry={() => undefined} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Algo deu errado' })).toBeTruthy();
    expect(screen.queryByText(/Código do erro/)).toBeNull();
  });

  it('"Tentar de novo" chama o retry pelo clique e pelo Enter', async () => {
    const retry = vi.fn();
    render(<ErrorScreen digest="42" retry={retry} />);
    const user = userEvent.setup();
    const button = screen.getByRole('button', { name: 'Tentar de novo' });

    await user.click(button);
    expect(retry).toHaveBeenCalledTimes(1);

    button.focus();
    await user.keyboard('{Enter}');
    expect(retry).toHaveBeenCalledTimes(2);
  });
});
