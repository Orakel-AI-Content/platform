// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePolling } from './usePolling.ts';

// Consulta periódica (#636): sem timer quando inativa, sem consultas sobrepostas e timer
// limpo ao desativar ou desmontar.

const poll = vi.fn<() => Promise<unknown>>();

function Polling({ active }: { active: boolean }) {
  usePolling(active, poll, 100);
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  poll.mockReset();
  poll.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('usePolling', () => {
  it('inativo, não cria timer nem consulta', async () => {
    render(<Polling active={false} />);
    expect(vi.getTimerCount()).toBe(0);
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(poll).not.toHaveBeenCalled();
  });

  it('ativo, consulta a cada intervalo', async () => {
    render(<Polling active />);
    expect(poll).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(poll).toHaveBeenCalledTimes(3);
  });

  it('uma consulta em andamento impede que a próxima comece', async () => {
    let finish: () => void = () => undefined;
    poll.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(<Polling active />);
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(poll).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish();
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it('uma consulta rejeitada não para as seguintes', async () => {
    poll.mockRejectedValueOnce(new Error('rede'));
    render(<Polling active />);
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it('desativar limpa o timer', async () => {
    const { rerender } = render(<Polling active />);
    expect(vi.getTimerCount()).toBe(1);
    rerender(<Polling active={false} />);
    expect(vi.getTimerCount()).toBe(0);
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(poll).not.toHaveBeenCalled();
  });

  it('desmontar limpa o timer', () => {
    const { unmount } = render(<Polling active />);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
