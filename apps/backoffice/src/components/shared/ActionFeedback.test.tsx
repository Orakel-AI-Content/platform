// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { toast, ToastProvider } from '@/components/ui/toast';

import type { ActionResult } from './actionResult.ts';
import { ActionAlert, useActionResult } from './ActionFeedback.tsx';

// Retorno padrão das ações (#324): sucesso no toast, erro no Alert junto da ação.

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

function Harness({ results }: { results: ActionResult[] }) {
  const { pending, error, run } = useActionResult();
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => Promise.resolve(results.shift()!))}
      >
        Executar
      </button>
      <ActionAlert error={error} />
      <ToastProvider />
    </>
  );
}

describe('useActionResult e ActionAlert', () => {
  it('sucesso vai para um toast success na região status, sem Alert', async () => {
    const user = userEvent.setup();
    render(<Harness results={[{ ok: true, message: 'Build enfileirado.' }]} />);

    await user.click(screen.getByRole('button', { name: 'Executar' }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Build enfileirado.'));
    expect(screen.getByRole('status').querySelector('.notification')).not.toBeNull();
    expect(screen.getByRole('alert').textContent).toBe('');
  });

  it('erro aparece no Alert dentro do contêiner role="alert"', async () => {
    const user = userEvent.setup();
    render(<Harness results={[{ ok: false, message: 'Site pausado: não publica.' }]} />);
    const region = screen.getByRole('alert');

    await user.click(screen.getByRole('button', { name: 'Executar' }));

    await waitFor(() => expect(region.textContent).toBe('Site pausado: não publica.'));
    expect(region.querySelector('.alert')).not.toBeNull();
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('um novo run limpa o erro', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        results={[
          { ok: false, message: 'Falhou.' },
          { ok: true, message: 'Deu certo.' },
        ]}
      />,
    );
    const button = screen.getByRole('button', { name: 'Executar' });

    await user.click(button);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Falhou.'));
    await user.click(button);

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Deu certo.'));
    expect(screen.getByRole('alert').textContent).toBe('');
  });
});
