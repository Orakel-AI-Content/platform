// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { toast, ToastProvider } from '@/components/ui/toast';

import type { SiteFormResult } from './siteConfigFormValues.ts';
import { BuildWindowForm, RegisterG1Form } from './SiteActions.tsx';
import { fieldLabel } from '@/test/fieldLabel.ts';

// G1 e janela gerados do schema (#333): validação no campo, "Usar padrão" sem schema, recusa
// do domínio no campo e os botões no rodapé do cartão.

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

// A mensagem de erro do FormItem (#245) anima com o motion, que o happy-dom cancela no `cleanup`.
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

const WINDOW_MESSAGE = 'Informe um número inteiro de segundos, 0 ou mais.';
const saved = (message: string): Promise<SiteFormResult> => Promise.resolve({ ok: true, message });

const windowInput = () =>
  screen.getByLabelText<HTMLInputElement>(fieldLabel('Janela própria (segundos)'));

describe('RegisterG1Form', () => {
  it('envia a observação pelo schema e mostra a confirmação no toast', async () => {
    const user = userEvent.setup();
    const action = vi.fn(() => saved('G1 registrado.'));
    render(<RegisterG1Form intro={<h2>G1 (indexação)</h2>} action={action} />);
    render(<ToastProvider />);

    await user.type(screen.getByLabelText(fieldLabel('Observação do G1')), 'Políticas publicadas');
    await user.click(screen.getByRole('button', { name: 'Registrar G1' }));

    expect(action).toHaveBeenCalledWith({ note: 'Políticas publicadas' });
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('G1 registrado.'));
  });

  it('o cartão tem a introdução no corpo e o envio solid no rodapé', () => {
    render(<RegisterG1Form intro={<h2>G1 (indexação)</h2>} action={vi.fn()} />);

    const card = document.querySelector('.card');
    expect(card?.querySelector('.card-body h2')?.textContent).toBe('G1 (indexação)');
    const submit = screen.getByRole('button', { name: 'Registrar G1' });
    expect(card?.querySelector('.card-footer')?.contains(submit)).toBe(true);
    expect(submit.className).toContain('bg-primary');
    expect(document.querySelector('.sticky')).toBeNull();
  });
});

describe('BuildWindowForm', () => {
  it.each([
    ['vazio', ''],
    ['negativo', '-1'],
    ['não inteiro', '1.5'],
  ])('valor %s mostra o erro no campo, sem chamar a ação', async (_, typed) => {
    const user = userEvent.setup();
    const action = vi.fn(() => saved('ok'));
    render(<BuildWindowForm intro={null} own={null} action={action} />);

    if (typed !== '') await user.type(windowInput(), typed);
    await user.click(screen.getByRole('button', { name: 'Salvar janela' }));

    await waitFor(() => expect(windowInput().getAttribute('aria-invalid')).toBe('true'));
    expect(screen.getAllByText(WINDOW_MESSAGE).length).toBeGreaterThan(0);
    expect(action).not.toHaveBeenCalled();
  });

  it('salva a janela própria', async () => {
    const user = userEvent.setup();
    const action = vi.fn(() => saved('Janela de 30 s salva.'));
    render(<BuildWindowForm intro={null} own={null} action={action} />);
    render(<ToastProvider />);

    await user.type(windowInput(), '30');
    await user.click(screen.getByRole('button', { name: 'Salvar janela' }));

    expect(action).toHaveBeenCalledWith({ buildWindowSeconds: 30 });
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Janela de 30 s salva.'),
    );
  });

  it('"Usar padrão" envia null mesmo com o campo inválido e limpa o campo', async () => {
    const user = userEvent.setup();
    const action = vi.fn(() => saved('Janela padrão restaurada.'));
    render(<BuildWindowForm intro={null} own={45} action={action} />);
    render(<ToastProvider />);
    expect(windowInput().value).toBe('45');

    await user.clear(windowInput());
    await user.type(windowInput(), '-3');
    await user.click(screen.getByRole('button', { name: 'Usar padrão' }));

    expect(action).toHaveBeenCalledWith(null);
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Janela padrão restaurada.'),
    );
    expect(windowInput().value).toBe('');
  });

  it('a recusa do domínio com path aparece no campo', async () => {
    const user = userEvent.setup();
    const action = vi.fn((): Promise<SiteFormResult> =>
      Promise.resolve({
        ok: false,
        message: 'Não foi possível concluir.',
        issues: [{ path: ['buildWindowSeconds'], message: 'Janela recusada pelo domínio.' }],
      }),
    );
    render(<BuildWindowForm intro={null} own={null} action={action} />);

    await user.type(windowInput(), '30');
    await user.click(screen.getByRole('button', { name: 'Salvar janela' }));

    await waitFor(() => expect(windowInput().getAttribute('aria-invalid')).toBe('true'));
    expect(screen.getAllByText('Janela recusada pelo domínio.').length).toBeGreaterThan(0);
  });

  it('"Salvar janela" e "Usar padrão" no rodapé do cartão, do mesmo tamanho', () => {
    render(<BuildWindowForm intro={null} own={null} action={vi.fn()} />);

    const footer = document.querySelector('.card .card-footer');
    const save = screen.getByRole('button', { name: 'Salvar janela' });
    const reset = screen.getByRole('button', { name: 'Usar padrão' });
    expect(footer?.contains(save)).toBe(true);
    expect(footer?.contains(reset)).toBe(true);
    const size = (button: HTMLElement) =>
      button.className.split(' ').filter((name) => /^(h-|px-|py-)/.test(name));
    expect(size(reset)).toEqual(size(save));
    expect(save.className).toContain('bg-primary');
  });
});
