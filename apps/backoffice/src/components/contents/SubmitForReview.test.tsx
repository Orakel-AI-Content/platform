// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { toast, ToastProvider } from '@/components/ui/toast';

import { SubmitForReview, SubmitForReviewScope } from './SubmitForReview.tsx';

// Botão Enviar para revisão (#74): rótulo, teclado e o retorno padrão (sucesso no toast,
// recusa no Alert do escopo, abaixo do cabeçalho, #371).

function Submit(props: Parameters<typeof SubmitForReview>[0]) {
  return (
    <SubmitForReviewScope>
      <SubmitForReview {...props} />
    </SubmitForReviewScope>
  );
}

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
        <Submit available action={action} />
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
    render(<Submit available action={action} />);

    await userEvent.click(screen.getByRole('button', { name: 'Enviar para revisão' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Só um rascunho/));
    expect(screen.getByRole('alert').querySelector('.alert')).toBeTruthy();
  });
});

describe('disponibilidade', () => {
  it('sem rascunho e sem erro, não mostra botão e o Alert fica vazio', () => {
    render(<Submit available={false} action={vi.fn()} />);

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('alert').textContent).toBe('');
  });

  it('a recusa continua no Alert do escopo quando a revalidação tira o botão', async () => {
    const action = vi.fn().mockResolvedValue({ ok: false, message: 'Sem rascunho.' });
    const { rerender } = render(<Submit available action={action} />);
    await userEvent.click(screen.getByRole('button', { name: 'Enviar para revisão' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Sem rascunho.'));

    rerender(<Submit available={false} action={action} />);

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('alert').textContent).toBe('Sem rascunho.');
  });

  it('fora do escopo, o botão acusa o erro de montagem', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<SubmitForReview available action={vi.fn()} />)).toThrow(
      'SubmitForReview fora de um SubmitForReviewScope.',
    );
    vi.mocked(console.error).mockRestore();
  });

  it('depois do envio, a página revalida sem o botão e o toast continua', async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, message: 'Enviado para revisão.' });
    const { rerender } = render(
      <>
        <Submit available action={action} />
        <ToastProvider />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Enviar para revisão' }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Enviado para revisão.'),
    );

    rerender(
      <>
        <Submit available={false} action={action} />
        <ToastProvider />
      </>,
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Enviado para revisão.');
  });
});
