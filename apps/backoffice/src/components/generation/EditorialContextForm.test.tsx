// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { EntityFormResult } from '@/components/editorial/EntityForms';
import { toast } from '@/components/ui/toast';
import { fieldLabel } from '@/test/fieldLabel.ts';

import { EditorialContextForm } from './EditorialContextForm.tsx';

// Nova versão do contexto editorial: parte do texto atual, envia o texto e volta para a lista;
// texto vazio é recusado no campo, sem chamar a ação; a recusa do domínio volta no campo.

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

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
  vi.clearAllMocks();
});

const field = () => screen.getByLabelText(fieldLabel('Contexto editorial'));

function renderForm(action: (value: unknown) => Promise<EntityFormResult>, defaultBody = '') {
  render(<EditorialContextForm siteId="exemplo-a" defaultBody={defaultBody} action={action} />);
}

describe('formulário do contexto editorial', () => {
  it('parte do texto atual, salva a versão nova e volta para a lista', async () => {
    const user = userEvent.setup();
    const action = vi.fn(() => Promise.resolve<EntityFormResult>({ ok: true, message: 'Salvo.' }));
    renderForm(action, 'Tom leve.');

    expect((field() as HTMLTextAreaElement).value).toBe('Tom leve.');
    await user.type(field(), ' Sem jargão.');
    await user.click(screen.getByRole('button', { name: 'Salvar versão' }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/sites/exemplo-a/contextos'));
    expect(action).toHaveBeenCalledWith({ body: 'Tom leve. Sem jargão.' });
  });

  it('texto vazio é recusado no campo, sem chamar a ação', async () => {
    const user = userEvent.setup();
    const action = vi.fn(() => Promise.resolve<EntityFormResult>({ ok: true, message: 'Salvo.' }));
    renderForm(action);

    await user.click(screen.getByRole('button', { name: 'Salvar versão' }));

    await waitFor(() => expect(field().getAttribute('aria-invalid')).toBe('true'));
    expect(action).not.toHaveBeenCalled();
  });

  it('a recusa do domínio volta no campo', async () => {
    const user = userEvent.setup();
    const action = vi.fn(() =>
      Promise.resolve<EntityFormResult>({
        ok: false,
        message: 'Não foi possível salvar.',
        issues: [{ path: ['body'], message: 'Sem permissão para content.write' }],
      }),
    );
    renderForm(action, 'Tom leve.');

    await user.click(screen.getByRole('button', { name: 'Salvar versão' }));

    expect(await screen.findAllByText('Sem permissão para content.write')).not.toHaveLength(0);
    expect(router.push).not.toHaveBeenCalled();
  });
});
