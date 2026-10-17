// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Notification } from '../Notification/index.tsx';
import { toast, ToastProvider } from './index.ts';

// toast do Ecme (#212) sem `createRoot`: o `push` enfileira no store do módulo e o ToastProvider
// mostra as mensagens, numa região viva por placement.

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

const regions = () => document.querySelectorAll('[data-toast-placement]');

describe('ToastProvider', () => {
  it('nasce com a região viva da placement padrão, vazia', () => {
    render(<ToastProvider />);

    expect([...regions()].map((region) => region.getAttribute('data-toast-placement'))).toEqual([
      'top-end',
    ]);
    const region = regions()[0]!;
    expect(region.getAttribute('role')).toBe('status');
    expect(region.className).toContain('toast');
    expect(region.textContent).toBe('');
  });

  it('push antes de montar aparece quando o provedor monta; a key é devolvida', () => {
    let key = '';
    act(() => {
      key = toast.push(<Notification title="Salvo antes" duration={0} />);
    });
    expect(key).toMatch(/^toast-\d+$/);

    render(<ToastProvider />);
    expect(screen.getByRole('status').textContent).toContain('Salvo antes');
  });

  it('danger vai num item role="alert"; outra placement ganha a própria região', () => {
    render(<ToastProvider />);
    act(() => {
      toast.push(<Notification type="danger" title="Falhou" duration={0} />, {
        placement: 'bottom-start',
      });
    });

    expect(screen.getByRole('alert').textContent).toContain('Falhou');
    expect([...regions()].map((region) => region.getAttribute('data-toast-placement'))).toEqual([
      'top-end',
      'bottom-start',
    ]);
  });

  it('remove(key) e removeAll() tiram as mensagens', async () => {
    render(<ToastProvider />);
    let first = '';
    act(() => {
      first = toast.push(<Notification title="Primeira" duration={0} />);
      toast.push(<Notification title="Segunda" duration={0} />);
    });
    expect(screen.getByText('Primeira')).toBeTruthy();

    act(() => toast.remove(first));
    await waitFor(() => expect(screen.queryByText('Primeira')).toBeNull());
    expect(screen.getByText('Segunda')).toBeTruthy();

    act(() => toast.removeAll());
    await waitFor(() => expect(screen.queryByText('Segunda')).toBeNull());
  });

  it('a mensagem sai sozinha depois do duration da Notification', async () => {
    render(<ToastProvider />);
    act(() => {
      toast.push(<Notification title="Some logo" duration={100} />);
    });
    expect(screen.getByText('Some logo')).toBeTruthy();

    await waitFor(() => expect(screen.queryByText('Some logo')).toBeNull(), { timeout: 1000 });
  });

  it('o Fechar da Notification closable tira a mensagem', async () => {
    render(<ToastProvider />);
    act(() => {
      toast.push(<Notification closable title="Com fechar" duration={0} />);
    });

    act(() => screen.getByRole('button', { name: 'Fechar' }).click());
    await waitFor(() => expect(screen.queryByText('Com fechar')).toBeNull());
  });
});
