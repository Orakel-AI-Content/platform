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
    render(<SubmitForReview action={action} />);

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
    render(<SubmitForReview action={action} />);

    await userEvent.click(screen.getByRole('button', { name: 'Enviar para revisão' }));

    const status = await screen.findByText(/Só um rascunho/);
    expect(status.getAttribute('role')).toBe('status');
    expect(status.className).toContain('text-destructive');
  });
});
