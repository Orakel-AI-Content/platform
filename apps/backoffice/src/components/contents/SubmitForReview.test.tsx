// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { toast, ToastProvider } from '@/components/ui/toast';

import { SubmitForReview } from './SubmitForReview.tsx';

// Botão Enviar para revisão (#74): rótulo, teclado e o retorno padrão (sucesso no toast,
// recusa no Alert junto do botão).

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
afterEach(async () => {
  act(() => toast.removeAll());
  await act(() => new Promise((resolve) => setTimeout(resolve, 60)));
  cleanup();
});

describe('enviar para revisão', () => {
  it('pelo teclado, chama a action e anuncia o sucesso no toast', async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, message: 'Enviado para revisão.' });
    render(
      <>
        <SubmitForReview available action={action} />
        <ToastProvider />
      </>,
    );

    await userEvent.tab();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Enviar para revisão' }),
    );
    await userEvent.keyboard('{Enter}');

    expect(action).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Enviado para revisão.'),
    );
    expect(screen.getByRole('alert').textContent).toBe('');
  });

  it('mostra a recusa do domínio no Alert, junto do botão', async () => {
    const action = vi.fn().mockResolvedValue({
      ok: false,
      message: 'Só um rascunho vai para revisão: a versão 2 está em_revisao',
    });
    render(<SubmitForReview available action={action} />);

    await userEvent.click(screen.getByRole('button', { name: 'Enviar para revisão' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Só um rascunho/));
    expect(screen.getByRole('alert').querySelector('.alert')).toBeTruthy();
  });
});

describe('disponibilidade', () => {
  it('sem rascunho e sem erro, não mostra nada', () => {
    render(<SubmitForReview available={false} action={vi.fn()} />);

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('depois do envio, a página revalida sem o botão e o toast continua', async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, message: 'Enviado para revisão.' });
    const { rerender } = render(
      <>
        <SubmitForReview available action={action} />
        <ToastProvider />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Enviar para revisão' }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Enviado para revisão.'),
    );

    rerender(
      <>
        <SubmitForReview available={false} action={action} />
        <ToastProvider />
      </>,
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Enviado para revisão.');
  });
});
