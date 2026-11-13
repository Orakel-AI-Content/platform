import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';

import { appElementWarnings, appRoot, expectFocusTrapped } from '../../../test/browser/dialog.ts';
import { renderInApp } from '../../../test/browser/render.tsx';
import type { ActionResult } from '@/components/shared/actionResult.ts';
import type { InfraPlanSummary } from '@/domain/infra/drivers.ts';
import type { InfraPlanView } from '@/domain/infra/plan.ts';

import { TITLE } from './CreateInfraDialog.tsx';
import { LifecycleAction, LifecycleActionScope, type CreateInfraActions } from './SiteActions.tsx';

// "Criar infraestrutura" em Chromium (#825): o diálogo preparando, com o resumo e com o erro ao
// preparar; o foco fica preso e volta ao gatilho; nada é confirmado antes de "Confirmar".

const SUMMARY: InfraPlanSummary = {
  formatVersion: 1,
  steps: {
    endereco: [{ address: 'z', type: 'cloudflare_zone', action: 'create' }],
    dns: [{ address: 'd', type: 'cloudflare_dns_record', action: 'create' }],
    email: [],
    regras: [],
    imagens: [{ address: 'b', type: 'cloudflare_r2_bucket', action: 'create' }],
  },
};

const ok = (): Promise<ActionResult> => Promise.resolve({ ok: true, message: '' });

function renderAction(overrides: Partial<CreateInfraActions>) {
  const infra: CreateInfraActions = {
    open: null,
    request: () => Promise.resolve({ ok: true, runId: 7 }),
    read: (): Promise<InfraPlanView> =>
      Promise.resolve({ status: 'aguardando_confirmacao', summary: SUMMARY }),
    confirm: vi.fn(ok),
    ...overrides,
  };
  return renderInApp(
    <LifecycleActionScope>
      <LifecycleAction lifecycle="cadastrado" check={ok} undo={ok} infra={infra} />
    </LifecycleActionScope>,
  );
}

const dialog = () => page.getByRole('alertdialog', { name: TITLE });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Criar infraestrutura no navegador', () => {
  it('preparando: anuncia o preparo, "Confirmar" desativado e o foco preso', async () => {
    const warnings = appElementWarnings();
    const screen = await renderAction({
      read: () => Promise.resolve({ status: 'planejando' }),
    });

    await screen.getByRole('button', { name: 'Criar infraestrutura' }).click();

    await expect
      .element(dialog().getByRole('status'))
      .toHaveTextContent('Preparando o resumo do que será criado…');
    await expect.element(dialog().getByRole('button', { name: 'Confirmar' })).toBeDisabled();
    expect(appRoot().inert).toBe(true);
    await expectFocusTrapped(dialog());
    expect(warnings()).toEqual([]);
  });

  it('resumo: Cancelar fecha sem confirmar e devolve o foco; Confirmar confirma a execução', async () => {
    const confirm = vi.fn(ok);
    const screen = await renderAction({ confirm });
    const trigger = screen.getByRole('button', { name: 'Criar infraestrutura' });

    await trigger.click();
    const summary = dialog().getByRole('list', { name: 'Resumo por etapa' });
    await expect.element(summary.getByText('Armazenamento de imagens')).toBeVisible();
    await expect.element(summary.getByText('Nada muda').first()).toBeVisible();

    await dialog().getByRole('button', { name: 'Cancelar' }).click();
    await expect.element(dialog()).not.toBeInTheDocument();
    await expect.element(trigger).toHaveFocus();
    expect(confirm).not.toHaveBeenCalled();

    await trigger.click();
    await dialog().getByRole('button', { name: 'Confirmar' }).click();
    await expect.element(dialog()).not.toBeInTheDocument();
    expect(confirm).toHaveBeenCalledExactlyOnceWith(7);
  });

  it('erro ao preparar: a mensagem no Alert e "Confirmar" desativado', async () => {
    const screen = await renderAction({
      read: () => Promise.resolve({ status: 'falhou', message: 'token de infra expirado' }),
    });

    await screen.getByRole('button', { name: 'Criar infraestrutura' }).click();

    await expect.element(dialog().getByRole('alert')).toHaveTextContent('token de infra expirado');
    await expect.element(dialog().getByRole('button', { name: 'Confirmar' })).toBeDisabled();
  });
});
