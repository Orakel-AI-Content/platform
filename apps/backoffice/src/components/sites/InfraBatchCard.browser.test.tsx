import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';

import { renderUi } from '../../../test/browser/render.tsx';

import { InfraBatchProgress } from './InfraBatchCard.tsx';
import type { InfraBatchSiteView, InfraBatchView } from './infraBatchView.ts';

// Cartão do lote "Reaplicar nos desatualizados" em Chromium (workspace#98): em andamento, o
// avanço que o polling traz anunciado no `role="status"`; concluído; interrompido, com o site, a
// etapa e o motivo. Sem axe: o cartão é composto dos componentes de base (ADR 0020).

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
  sites: [site('exemplo-a', { status: 'aplicando', currentStep: 'dns' }), site('exemplo-b')],
  ...overrides,
});

const NAMES = { 'exemplo-a': 'Exemplo A', 'exemplo-b': 'Exemplo B' };
const progress = () => page.getByRole('status', { name: 'Progresso da reaplicação' });
const sites = () => page.getByRole('list', { name: 'Sites da reaplicação' });

describe('Cartão do lote no navegador', () => {
  it('em andamento: o site que aplica com a etapa; o avanço do polling chega ao status', async () => {
    const read = vi.fn().mockResolvedValue(
      batch({
        sites: [site('exemplo-a', { status: 'ok' }), site('exemplo-b', { status: 'aplicando' })],
      }),
    );
    await renderUi(
      <InfraBatchProgress
        initial={batch()}
        read={read}
        refresh={() => Promise.resolve()}
        names={NAMES}
        pollMs={20}
      />,
    );

    await expect.poll(() => progress().element().textContent).toContain('em andamento · 0 de 2');
    await expect.element(sites().getByText('Aplicando · Registros de DNS')).toBeVisible();

    await expect.poll(() => progress().element().textContent).toContain('em andamento · 1 de 2');
    await expect.element(sites().getByText('Em dia')).toBeVisible();
  });

  it('concluído: todos em dia, sem leitura', async () => {
    const read = vi.fn();
    await renderUi(
      <InfraBatchProgress
        initial={batch({
          state: 'concluido',
          finishedAt: new Date(),
          sites: [site('exemplo-a', { status: 'ok' }), site('exemplo-b', { status: 'ok' })],
        })}
        read={read}
        refresh={() => Promise.resolve()}
        names={NAMES}
      />,
    );

    await expect.poll(() => progress().element().textContent).toContain('concluída · 2 de 2');
    expect(read).not.toHaveBeenCalled();
  });

  it('interrompido: o site que falhou, a etapa e o motivo; o seguinte não aplicado', async () => {
    await renderUi(
      <InfraBatchProgress
        initial={batch({
          state: 'interrompido',
          finishedAt: new Date(),
          sites: [
            site('exemplo-a', {
              status: 'falhou',
              failure: { step: 'regras', message: 'limite de regras da zona' },
            }),
            site('exemplo-b', { status: 'cancelado' }),
          ],
        })}
        read={vi.fn()}
        refresh={() => Promise.resolve()}
        names={NAMES}
      />,
    );

    await expect.poll(() => progress().element().textContent).toContain('interrompida · 0 de 2');
    await expect
      .element(sites().getByText('Falhou em Regras: limite de regras da zona'))
      .toBeVisible();
    await expect.element(sites().getByText('Não aplicado')).toBeVisible();
    await expect
      .element(page.getByText('Os sites não aplicados continuam como estavam, desatualizados.'))
      .toBeVisible();
  });
});
