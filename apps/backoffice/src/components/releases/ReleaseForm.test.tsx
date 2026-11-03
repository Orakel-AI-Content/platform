// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ReleaseForm, type ReleaseFormResult } from './ReleaseForm.tsx';

// Cadastro de release (#509): formato conferido no cliente pelo schema da tag, recusa do
// domínio no campo e, ao registrar, volta para a lista com a marca da confirmação.

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

// A mensagem de erro do FormItem anima com o motion, que o happy-dom cancela no `cleanup`.
beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

afterEach(async () => {
  await act(() => new Promise((resolve) => setTimeout(resolve, 60)));
  cleanup();
  vi.clearAllMocks();
});

const renderForm = (result: ReleaseFormResult) => {
  const action = vi.fn(() => Promise.resolve(result));
  render(<ReleaseForm action={action} />);
  return action;
};

describe('ReleaseForm', () => {
  it('registra a tag aparada e volta para a lista com ?registrada', async () => {
    const user = userEvent.setup();
    const action = renderForm({ ok: true, message: 'Release core-v1.2.0 registrada.' });

    await user.type(screen.getByRole('textbox', { name: /Tag/ }), ' core-v1.2.0 ');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));

    expect(action).toHaveBeenCalledWith({ tag: 'core-v1.2.0' });
    expect(router.push).toHaveBeenCalledWith('/releases?registrada=core-v1.2.0');
  });

  it('fora do formato, recusa no campo sem chamar a action', async () => {
    const user = userEvent.setup();
    const action = renderForm({ ok: true, message: '' });

    await user.type(screen.getByRole('textbox', { name: /Tag/ }), 'v1.2.0');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));

    expect(await screen.findAllByText(/formato core-vX\.Y\.Z \(ex\./)).not.toHaveLength(0);
    expect(action).not.toHaveBeenCalled();
  });

  it('a recusa do domínio (tag repetida) aparece no campo', async () => {
    const user = userEvent.setup();
    renderForm({
      ok: false,
      message: 'Não foi possível registrar a release.',
      issues: [{ path: ['tag'], message: 'A release core-v1.2.0 já está registrada' }],
    });

    await user.type(screen.getByRole('textbox', { name: /Tag/ }), 'core-v1.2.0');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));

    expect(await screen.findAllByText('A release core-v1.2.0 já está registrada')).not.toHaveLength(
      0,
    );
    expect(router.push).not.toHaveBeenCalled();
  });
});
