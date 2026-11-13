// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import Modal from 'react-modal';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionResult } from '@/components/shared/actionResult.ts';
import { APP_ELEMENT_ID } from '@/components/ui/utils/modalApp';
import type { InfraPlanSummary } from '@/domain/infra/drivers.ts';

import { INFRA_SUMMARY_UNREADABLE } from './CreateInfraDialog.tsx';
import type { InfraBatchSiteView, InfraBatchView } from './infraBatchView.ts';
import {
  INFRA_BATCH_ALREADY_CONFIRMED,
  outdatedBatchState,
  REAPPLY_OUTDATED_TITLE,
  ReapplyOutdatedButton,
  type ReapplyOutdatedActions,
} from './ReapplyOutdatedDialog.tsx';

// "Reaplicar nos desatualizados" (workspace#98): o estado do diálogo pelo lote, o lote aberto
// retomado em vez de pedido de novo e nada confirmado antes de "Confirmar".

let app: HTMLElement;

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
beforeEach(() => {
  app = document.createElement('div');
  app.id = APP_ELEMENT_ID;
  document.body.append(app);
  Modal.setAppElement(app);
});
afterEach(async () => {
  cleanup();
  await waitFor(() => expect(document.querySelector('.dialog-portal')).toBeNull());
  app.remove();
});

const SUMMARY: InfraPlanSummary = {
  formatVersion: 1,
  steps: {
    endereco: [],
    dns: [],
    email: [],
    regras: [{ address: 'r', type: 'cloudflare_ruleset', action: 'update' }],
    imagens: [],
  },
};

const batchSite = (siteId: string, overrides: Partial<InfraBatchSiteView> = {}) => ({
  siteId,
  status: 'aguardando_confirmacao' as const,
  currentStep: null,
  summary: SUMMARY,
  failure: null,
  ...overrides,
});

const batch = (overrides: Partial<InfraBatchView> = {}): InfraBatchView => ({
  id: 3,
  state: 'aguardando_confirmacao',
  requestedBy: 'operacao@orakel.local',
  startedAt: new Date('2026-11-13T12:00:00Z'),
  finishedAt: null,
  sites: [batchSite('exemplo-a'), batchSite('exemplo-b')],
  ...overrides,
});

describe('outdatedBatchState', () => {
  it('planejando: preparando', () => {
    expect(outdatedBatchState(batch({ state: 'planejando' }))).toEqual({ kind: 'preparando' });
  });

  it('aguardando confirmação: o resumo de cada site, na ordem', () => {
    expect(outdatedBatchState(batch())).toEqual({
      kind: 'resumo',
      sites: [
        { siteId: 'exemplo-a', summary: SUMMARY },
        { siteId: 'exemplo-b', summary: SUMMARY },
      ],
    });
  });

  it('um resumo ilegível vira erro, sem confirmar parte do lote', () => {
    const state = outdatedBatchState(
      batch({ sites: [batchSite('exemplo-a'), batchSite('exemplo-b', { summary: null })] }),
    );
    expect(state).toEqual({ kind: 'erro', message: INFRA_SUMMARY_UNREADABLE });
  });

  it('interrompido no plano: o site, a etapa e o motivo', () => {
    const state = outdatedBatchState(
      batch({
        state: 'interrompido',
        sites: [
          batchSite('exemplo-a', { status: 'cancelado' }),
          batchSite('exemplo-b', {
            status: 'falhou',
            summary: null,
            failure: { step: 'dns', message: 'token expirado' },
          }),
        ],
      }),
    );
    expect(state).toEqual({
      kind: 'erro',
      message: 'exemplo-b (Registros de DNS): token expirado',
    });
  });

  it('já aplicando ou concluído: não há o que confirmar', () => {
    for (const state of ['aplicando', 'concluido'] as const) {
      expect(outdatedBatchState(batch({ state }))).toEqual({
        kind: 'erro',
        message: INFRA_BATCH_ALREADY_CONFIRMED,
      });
    }
  });
});

const ok = (message = 'Reaplicação nos desatualizados confirmada.'): Promise<ActionResult> =>
  Promise.resolve({ ok: true, message });

function renderButton(overrides: Partial<ReapplyOutdatedActions> = {}) {
  const actions: ReapplyOutdatedActions = {
    request: vi.fn(() => Promise.resolve({ ok: true as const, batchId: 3 })),
    read: vi.fn().mockResolvedValueOnce(null).mockResolvedValue(batch()),
    confirm: vi.fn(() => ok()),
    ...overrides,
  };
  render(
    <ReapplyOutdatedButton actions={actions} names={{ 'exemplo-a': 'Exemplo A' }} pollMs={10} />,
    { container: app },
  );
  return actions;
}

const open = () =>
  userEvent.click(screen.getByRole('button', { name: 'Reaplicar nos desatualizados' }));
const dialog = () => screen.getByRole('alertdialog', { name: REAPPLY_OUTDATED_TITLE });

describe('ReapplyOutdatedButton', () => {
  it('pede o lote e mostra o resumo de cada site, com o nome quando há', async () => {
    const actions = renderButton();
    await open();

    const sites = await within(dialog()).findByRole('list', { name: 'Sites a reaplicar' });
    expect(within(sites).getByRole('listitem', { name: 'Exemplo A' })).toBeTruthy();
    expect(within(sites).getByRole('listitem', { name: 'exemplo-b' })).toBeTruthy();
    expect(within(sites).getAllByText('1 a alterar')).toHaveLength(2);
    expect(actions.request).toHaveBeenCalledOnce();
    expect(actions.confirm).not.toHaveBeenCalled();
  });

  it('com um lote à espera da confirmação, retoma esse lote sem pedir outro', async () => {
    const actions = renderButton({
      read: vi.fn(() => Promise.resolve(batch({ id: 9 }))),
      request: vi.fn(() => Promise.resolve({ ok: false as const, message: 'lote aberto' })),
    });
    await open();

    await within(dialog()).findByRole('list', { name: 'Sites a reaplicar' });
    expect(actions.request).not.toHaveBeenCalled();
    expect(within(dialog()).getByRole('alert').textContent).toBe('');

    await userEvent.click(within(dialog()).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(actions.confirm).toHaveBeenCalledExactlyOnceWith(9));
  });

  it('espera os planos lendo o lote até sair de planejando', async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(batch({ state: 'planejando' }))
      .mockResolvedValue(batch());
    renderButton({ read });
    await open();

    expect(within(dialog()).getByRole('status').textContent).toContain('Preparando');
    expect(
      within(dialog()).getByRole<HTMLButtonElement>('button', { name: 'Confirmar' }).disabled,
    ).toBe(true);
    await within(dialog()).findByRole('list', { name: 'Sites a reaplicar' });
  });

  it('Cancelar fecha sem confirmar', async () => {
    const actions = renderButton();
    await open();
    await within(dialog()).findByRole('list', { name: 'Sites a reaplicar' });

    await userEvent.click(within(dialog()).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(actions.confirm).not.toHaveBeenCalled();
  });

  it('a recusa do pedido fica no Alert, com "Confirmar" desativado', async () => {
    renderButton({
      request: () =>
        Promise.resolve({
          ok: false,
          message: 'Nenhum site está com a infraestrutura desatualizada',
        }),
    });
    await open();

    const alert = await within(dialog()).findByRole('alert');
    expect(alert.textContent).toContain('Nenhum site está com a infraestrutura desatualizada');
    expect(
      within(dialog()).getByRole<HTMLButtonElement>('button', { name: 'Confirmar' }).disabled,
    ).toBe(true);
  });

  it('a recusa de "Confirmar" fica no Alert, com o diálogo aberto', async () => {
    renderButton({
      confirm: () => Promise.resolve({ ok: false, message: 'O lote 3 está em aplicando' }),
    });
    await open();
    await within(dialog()).findByRole('list', { name: 'Sites a reaplicar' });

    await userEvent.click(within(dialog()).getByRole('button', { name: 'Confirmar' }));

    const alert = await within(dialog()).findByRole('alert');
    expect(alert.textContent).toContain('O lote 3 está em aplicando');
  });
});
