// @vitest-environment happy-dom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InfraBatchCard, InfraBatchProgress } from './InfraBatchCard.tsx';
import type { InfraBatchSiteView, InfraBatchView } from './infraBatchView.ts';

// Cartão do lote "Reaplicar nos desatualizados" (workspace#98): o estado e "N de M", cada site com
// o estado e, na falha, a etapa e o motivo; o polling só com o lote aberto, relendo a lista quando
// ele fecha.

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const site = (siteId: string, overrides: Partial<InfraBatchSiteView> = {}): InfraBatchSiteView => ({
  siteId,
  status: 'aguardando_confirmacao',
  currentStep: null,
  summary: null,
  failure: null,
  ...overrides,
});

const batch = (overrides: Partial<InfraBatchView> = {}): InfraBatchView => ({
  id: 3,
  state: 'aplicando',
  requestedBy: 'operacao@orakel.local',
  startedAt: new Date('2026-11-13T12:00:00Z'),
  finishedAt: null,
  sites: [
    site('exemplo-a', { status: 'ok' }),
    site('exemplo-b', { status: 'aplicando', currentStep: 'regras' }),
    site('exemplo-c'),
  ],
  ...overrides,
});

const rows = () =>
  within(screen.getByRole('list', { name: 'Sites da reaplicação' }))
    .getAllByRole('listitem')
    .map((item) => item.textContent);

describe('InfraBatchCard', () => {
  it('em andamento: o estado, "N de M" e cada site na ordem, com a etapa do que aplica', () => {
    render(<InfraBatchCard batch={batch()} names={{ 'exemplo-a': 'Exemplo A' }} />);

    expect(screen.getByRole('status', { name: 'Progresso da reaplicação' }).textContent).toContain(
      'Reaplicação nos desatualizados · em andamento · 1 de 3',
    );
    expect(rows()).toEqual([
      'Exemplo AEm dia',
      'exemplo-bAplicando · Regras',
      'exemplo-cAguardando',
    ]);
  });

  it('concluído: todos em dia', () => {
    render(
      <InfraBatchCard
        batch={batch({
          state: 'concluido',
          finishedAt: new Date(),
          sites: [site('exemplo-a', { status: 'ok' }), site('exemplo-b', { status: 'ok' })],
        })}
      />,
    );

    expect(screen.getByRole('status').textContent).toContain('concluída · 2 de 2');
    expect(screen.queryByText(/continuam como estavam/)).toBeNull();
  });

  it('interrompido: o site que falhou com a etapa e o motivo; os seguintes não aplicados', () => {
    render(
      <InfraBatchCard
        batch={batch({
          state: 'interrompido',
          finishedAt: new Date(),
          sites: [
            site('exemplo-a', { status: 'ok' }),
            site('exemplo-b', {
              status: 'falhou',
              failure: { step: 'regras', message: 'limite de regras da zona' },
            }),
            site('exemplo-c', { status: 'cancelado' }),
          ],
        })}
      />,
    );

    expect(screen.getByRole('status').textContent).toContain('interrompida · 1 de 3');
    expect(rows()).toEqual([
      'exemplo-aEm dia',
      'exemplo-bFalhouFalhou em Regras: limite de regras da zona',
      'exemplo-cNão aplicado',
    ]);
    expect(
      screen.getByText('Os sites não aplicados continuam como estavam, desatualizados.'),
    ).toBeTruthy();
  });

  it('falha sem etapa nem motivo gravados', () => {
    render(
      <InfraBatchCard
        batch={batch({
          state: 'interrompido',
          sites: [site('exemplo-a', { status: 'falhou', failure: { step: null, message: null } })],
        })}
      />,
    );

    expect(screen.getByText('Falhou: sem motivo registrado')).toBeTruthy();
  });
});

describe('InfraBatchProgress', () => {
  it('relê o lote enquanto ele está aberto e relê a lista quando ele fecha', async () => {
    vi.useFakeTimers();
    const closed = batch({
      state: 'concluido',
      sites: [site('exemplo-a', { status: 'ok' })],
    });
    const read = vi.fn().mockResolvedValue(closed);
    const refresh = vi.fn(() => Promise.resolve());
    render(<InfraBatchProgress initial={batch()} read={read} refresh={refresh} pollMs={100} />);

    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(screen.getByRole('status').textContent).toContain('concluída · 1 de 1');
    expect(refresh).toHaveBeenCalledOnce();

    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(read).toHaveBeenCalledOnce();
  });

  it('lote já fechado: não lê nada', async () => {
    vi.useFakeTimers();
    const read = vi.fn();
    render(
      <InfraBatchProgress
        initial={batch({ state: 'interrompido' })}
        read={read}
        refresh={vi.fn()}
        pollMs={100}
      />,
    );

    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(read).not.toHaveBeenCalled();
  });

  it('ignora a leitura de outro lote', async () => {
    vi.useFakeTimers();
    const read = vi.fn().mockResolvedValue(batch({ id: 4, state: 'concluido' }));
    const refresh = vi.fn(() => Promise.resolve());
    render(<InfraBatchProgress initial={batch()} read={read} refresh={refresh} pollMs={100} />);

    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(screen.getByRole('status').textContent).toContain('em andamento');
    expect(refresh).not.toHaveBeenCalled();
  });
});
