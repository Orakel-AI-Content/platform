// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SubmitForReview } from './submit-for-review.tsx';

// Botão Enviar para revisão (#74): rótulo, teclado e retorno em role=status.

afterEach(cleanup);

describe('enviar para revisão', () => {
  it('pelo teclado, chama a action e anuncia o sucesso', async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, message: 'Enviado para revisão.' });
    render(<SubmitForReview available action={action} />);

    await userEvent.tab();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Enviar para revisão' }),
    );
    await userEvent.keyboard('{Enter}');

    expect(action).toHaveBeenCalledOnce();
    expect((await screen.findByRole('status')).textContent).toBe('Enviado para revisão.');
  });

  it('mostra a recusa do domínio com o estilo de erro', async () => {
    const action = vi.fn().mockResolvedValue({
      ok: false,
      message: 'Só um rascunho vai para revisão: a versão 2 está em_revisao',
    });
    render(<SubmitForReview available action={action} />);

    await userEvent.click(screen.getByRole('button', { name: 'Enviar para revisão' }));

    const status = await screen.findByText(/Só um rascunho/);
    expect(status.getAttribute('role')).toBe('status');
    expect(status.className).toContain('text-error');
  });
});

describe('disponibilidade', () => {
  it('sem rascunho e sem envio anterior, não mostra nada', () => {
    render(<SubmitForReview available={false} action={vi.fn()} />);

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('depois do envio, a página revalida sem o botão e a mensagem continua', async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, message: 'Enviado para revisão.' });
    const { rerender } = render(<SubmitForReview available action={action} />);
    await userEvent.click(screen.getByRole('button', { name: 'Enviar para revisão' }));
    await screen.findByText('Enviado para revisão.');

    rerender(<SubmitForReview available={false} action={action} />);

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Enviado para revisão.');
  });
});
