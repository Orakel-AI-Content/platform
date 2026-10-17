// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Notification } from './index.tsx';

// Notification do Ecme (#212): título, texto, ícone do tipo, Fechar pelo teclado e o tempo de
// `duration` chamando o onClose.

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Notification', () => {
  it('título, texto e ícone do tipo, com a largura padrão de 350 px', () => {
    const { container } = render(
      <Notification type="success" title="Artigo publicado" duration={0}>
        Ele já aparece no site.
      </Notification>,
    );

    const notification = container.querySelector<HTMLElement>('.notification')!;
    expect(notification.style.width).toBe('350px');
    expect(screen.getByText('Artigo publicado').className).toContain('notification-title');
    expect(screen.getByText('Ele já aparece no site.').className).toContain(
      'notification-description',
    );
    expect(notification.querySelector('[aria-hidden="true"]')?.className).toContain('text-success');
  });

  it('closable: "Fechar" pelo teclado chama onClose e some', async () => {
    const onClose = vi.fn();
    render(
      <Notification closable title="Aviso" duration={0} onClose={onClose}>
        Texto
      </Notification>,
    );

    screen.getByRole('button', { name: 'Fechar' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await act(() => new Promise((resolve) => setTimeout(resolve, 450)));
    expect(screen.queryByText('Aviso')).toBeNull();
  });

  it('duration chama o onClose sozinho', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<Notification title="Some" duration={2000} onClose={onClose} />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
