// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { StatusIcon } from '../StatusIcon/index.tsx';
import { Alert } from './index.tsx';

// Alert do Ecme (#212): fundo e ícone do tipo, texto neutro (contraste), fechar pelo teclado e
// o tempo de `duration` chamando o onClose.

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Alert', () => {
  it.each([
    ['info', 'bg-info-subtle', 'text-info'],
    ['success', 'bg-success-subtle', 'text-success'],
    ['warning', 'bg-warning-subtle', 'text-warning'],
    ['danger', 'bg-error-subtle', 'text-error'],
  ] as const)('%s: fundo e ícone do tipo, texto neutro', (type, background, icon) => {
    const { container } = render(
      <Alert type={type} showIcon title="Título" duration={0}>
        Texto do aviso
      </Alert>,
    );

    const alert = container.querySelector('.alert')!;
    expect(alert.className).toContain(background);
    expect(alert.className).toContain('text-gray-900');
    expect(alert.className).toContain('dark:text-gray-100');
    expect(screen.getByText('Título').className).toContain('text-gray-900');
    const iconWrapper = alert.querySelector('[aria-hidden="true"]')!;
    expect(iconWrapper.className).toContain(icon);
  });

  it('tipo desconhecido cai no warning do Ecme', () => {
    const { container } = render(
      // @ts-expect-error tipo fora da lista
      <Alert type="outro" duration={0}>
        Aviso
      </Alert>,
    );
    expect(container.querySelector('.alert')?.className).toContain('bg-warning-subtle');
  });

  it('closable: o botão "Fechar" fecha pelo teclado e chama onClose', async () => {
    const onClose = vi.fn();
    render(
      <Alert closable duration={0} onClose={onClose}>
        Rascunho salvo
      </Alert>,
    );

    const close = screen.getByRole('button', { name: 'Fechar' });
    expect(close.className).not.toContain('outline-hidden');
    close.focus();
    await userEvent.keyboard('{Enter}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await act(() => new Promise((resolve) => setTimeout(resolve, 450)));
    expect(screen.queryByText('Rascunho salvo')).toBeNull();
  });

  it('duration chama o onClose sozinho', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(
      <Alert duration={1000} onClose={onClose}>
        Some sozinho
      </Alert>,
    );

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('StatusIcon', () => {
  it('ícone do tipo, oculto do leitor de tela, com a cor dada', () => {
    const { container } = render(<StatusIcon type="success" iconColor="text-primary" />);

    const icon = container.firstElementChild!;
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.className).toContain('text-primary');
    expect(icon.querySelector('svg')).toBeTruthy();
  });
});
