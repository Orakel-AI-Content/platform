import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';

import { appElementWarnings, appRoot, expectFocusTrapped } from '../../../test/browser/dialog.ts';
import { renderInApp } from '../../../test/browser/render.tsx';
import type { ActionResult } from '@/components/shared/actionResult.ts';
import type { InfraPlanSummary } from '@/domain/infra/drivers.ts';

import type { InfraBatchView } from './infraBatchView.ts';
import {
  REAPPLY_OUTDATED_TITLE,
  ReapplyOutdatedButton,
  type ReapplyOutdatedActions,
} from './ReapplyOutdatedDialog.tsx';

// "Reaplicar nos desatualizados" em Chromium (workspace#98): o diálogo preparando, com o resumo
// de cada site e com o erro ao preparar; o foco fica preso e volta ao gatilho; nada é confirmado
// antes de "Confirmar".

const SUMMARY: InfraPlanSummary = {
  formatVersion: 1,
  steps: {
    endereco: [],
    dns: [{ address: 'd', type: 'cloudflare_dns_record', action: 'update' }],
    email: [],
    regras: [{ address: 'r', type: 'cloudflare_ruleset', action: 'replace' }],
    imagens: [],
  },
};

const batch = (overrides: Partial<InfraBatchView> = {}): InfraBatchView => ({
  id: 3,
  state: 'aguardando_confirmacao',
  requestedBy: 'operacao@orakel.local',
  startedAt: new Date('2026-11-13T12:00:00Z'),
  finishedAt: null,
  sites: ['exemplo-a', 'exemplo-b'].map((siteId) => ({
    siteId,
    status: 'aguardando_confirmacao',
    currentStep: null,
    summary: SUMMARY,
    failure: null,
  })),
  ...overrides,
});

const ok = (): Promise<ActionResult> => Promise.resolve({ ok: true, message: 'Confirmada.' });

function renderButton(overrides: Partial<ReapplyOutdatedActions>) {
  const actions: ReapplyOutdatedActions = {
    request: () => Promise.resolve({ ok: true, batchId: 3 }),
    read: vi.fn().mockResolvedValueOnce(null).mockResolvedValue(batch()),
    confirm: vi.fn(ok),
    ...overrides,
  };
  return renderInApp(
    <ReapplyOutdatedButton
      actions={actions}
      names={{ 'exemplo-a': 'Exemplo A', 'exemplo-b': 'Exemplo B' }}
      pollMs={20}
    />,
  );
}

const dialog = () => page.getByRole('alertdialog', { name: REAPPLY_OUTDATED_TITLE });
const trigger = () => page.getByRole('button', { name: 'Reaplicar nos desatualizados' });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Reaplicar nos desatualizados no navegador', () => {
  it('preparando: anuncia o preparo, "Confirmar" desativado e o foco preso', async () => {
    const warnings = appElementWarnings();
    await renderButton({
      read: () => Promise.resolve(batch({ state: 'planejando' })),
    });

    await trigger().click();

    await expect
      .element(dialog().getByRole('status'))
      .toHaveTextContent('Preparando o resumo de cada site desatualizado…');
    await expect.element(dialog().getByRole('button', { name: 'Confirmar' })).toBeDisabled();
    expect(appRoot().inert).toBe(true);
    await expectFocusTrapped(dialog());
    expect(warnings()).toEqual([]);
  });

  it('resumo: cada site com o que muda; Cancelar não confirma e devolve o foco; Confirmar confirma o lote', async () => {
    const confirm = vi.fn(ok);
    await renderButton({ confirm });

    await trigger().click();
    const sites = dialog().getByRole('list', { name: 'Sites a reaplicar' });
    for (const name of ['Exemplo A', 'Exemplo B']) {
      const site = sites.getByRole('listitem', { name, exact: true });
      await expect.element(site.getByText('1 a alterar')).toBeVisible();
      await expect.element(site.getByText('1 a recriar')).toBeVisible();
    }

    await dialog().getByRole('button', { name: 'Cancelar' }).click();
    await expect.element(dialog()).not.toBeInTheDocument();
    await expect.element(trigger()).toHaveFocus();
    expect(confirm).not.toHaveBeenCalled();

    await trigger().click();
    await dialog().getByRole('button', { name: 'Confirmar' }).click();
    await expect.element(dialog()).not.toBeInTheDocument();
    expect(confirm).toHaveBeenCalledExactlyOnceWith(3);
  });

  it('erro ao preparar: o site que falhou e o motivo no Alert, "Confirmar" desativado', async () => {
    await renderButton({
      read: () =>
        Promise.resolve(
          batch({
            state: 'interrompido',
            sites: [
              {
                siteId: 'exemplo-b',
                status: 'falhou',
                currentStep: null,
                summary: null,
                failure: { step: null, message: 'token de infra expirado' },
              },
            ],
          }),
        ),
      request: () => Promise.resolve({ ok: true, batchId: 3 }),
    });

    await trigger().click();

    await expect
      .element(dialog().getByRole('alert'))
      .toHaveTextContent('exemplo-b: token de infra expirado');
    await expect.element(dialog().getByRole('button', { name: 'Confirmar' })).toBeDisabled();
  });
});
