import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { appElementWarnings, appRoot, expectFocusTrapped } from '../../../test/browser/dialog.ts';
import { renderInApp } from '../../../test/browser/render.tsx';
import type { ActionResult } from '@/components/shared/actionResult.ts';
import type { InfraPlanSummary } from '@/domain/infra/drivers.ts';
import type { InfraPlanView } from '@/domain/infra/plan.ts';

import { DOMAIN_MISMATCH, REMOVE_TITLE } from './RemoveInfraDialog.tsx';
import { LifecycleAction, LifecycleActionScope, type RemoveInfraActions } from './SiteActions.tsx';

// "Remover infraestrutura" em Chromium (workspace#97): o diálogo preparando, com o resumo, com o
// domínio errado e com o erro ao preparar; pelo teclado, o foco fica preso e volta ao gatilho, e
// nada é confirmado sem o domínio exato. Só comportamento, sem axe (ADR 0020): o diálogo é de
// domínio, montado com os componentes de base que já passam pelo axe.

const DOMAIN = 'exemplo-a.com.br';
const SUMMARY: InfraPlanSummary = {
  formatVersion: 1,
  steps: {
    endereco: [{ address: 'z', type: 'cloudflare_zone', action: 'delete' }],
    dns: [{ address: 'd', type: 'cloudflare_dns_record', action: 'delete' }],
    email: [],
    regras: [],
    imagens: [{ address: 'b', type: 'cloudflare_r2_bucket', action: 'delete' }],
  },
};

const ok = (): Promise<ActionResult> => Promise.resolve({ ok: true, message: '' });

function renderAction(overrides: Partial<RemoveInfraActions> = {}) {
  const remove: RemoveInfraActions = {
    domain: DOMAIN,
    activePages: 12,
    active: false,
    open: null,
    request: () => Promise.resolve({ ok: true, runId: 9 }),
    read: (): Promise<InfraPlanView> =>
      Promise.resolve({ status: 'aguardando_confirmacao', summary: SUMMARY }),
    confirm: vi.fn(ok),
    ...overrides,
  };
  return renderInApp(
    <LifecycleActionScope>
      <LifecycleAction lifecycle="publicado" check={ok} undo={ok} remove={remove} />
    </LifecycleActionScope>,
  );
}

const dialog = () => page.getByRole('alertdialog', { name: REMOVE_TITLE });
const removeButton = () => dialog().getByRole('button', { name: 'Remover' });
const domainField = () =>
  dialog().getByRole('textbox', { name: `Digite ${DOMAIN} para confirmar` });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Remover infraestrutura no navegador', () => {
  it('preparando: anuncia o preparo, "Remover" desativado e o foco preso', async () => {
    const warnings = appElementWarnings();
    const screen = await renderAction({
      read: () => Promise.resolve({ status: 'planejando' }),
    });

    await screen.getByRole('button', { name: 'Remover infraestrutura' }).click();

    await expect
      .element(dialog().getByRole('status'))
      .toHaveTextContent('Preparando o resumo do que será apagado…');
    await expect.element(removeButton()).toBeDisabled();
    expect(appRoot().inert).toBe(true);
    await expectFocusTrapped(dialog());
    expect(warnings()).toEqual([]);
  });

  it('resumo: lista o que será apagado e o que fica; o domínio exato confirma pelo teclado', async () => {
    const confirm = vi.fn(ok);
    await renderAction({ confirm });

    await page.getByRole('button', { name: 'Remover infraestrutura' }).click();
    const removed = dialog().getByRole('list', { name: 'O que será apagado' });
    await expect.element(removed.getByText('Páginas publicadas')).toBeVisible();
    await expect.element(removed.getByText('12 a remover')).toBeVisible();
    await expect.element(removed.getByText('Armazenamento de imagens')).toBeVisible();
    await expect
      .element(
        dialog().getByRole('list', { name: 'O que fica' }).getByText('Originais das imagens'),
      )
      .toBeVisible();
    await expect.element(removeButton()).toBeDisabled();

    await domainField().click();
    await userEvent.keyboard(DOMAIN);
    await expect.element(removeButton()).toBeEnabled();
    await userEvent.tab();
    await userEvent.tab();
    await expect.element(removeButton()).toHaveFocus();
    await userEvent.keyboard('{Enter}');

    await expect.element(dialog()).not.toBeInTheDocument();
    expect(confirm).toHaveBeenCalledExactlyOnceWith(9, DOMAIN);
  });

  it('domínio errado: a mensagem no campo, "Remover" desativado e nada confirmado', async () => {
    const confirm = vi.fn(ok);
    await renderAction({ confirm });

    await page.getByRole('button', { name: 'Remover infraestrutura' }).click();
    await domainField().click();
    await userEvent.keyboard('outro.com.br');

    await expect.element(domainField()).toHaveAttribute('aria-invalid', 'true');
    await expect.element(dialog().getByText(DOMAIN_MISMATCH)).toBeVisible();
    await expect.element(removeButton()).toBeDisabled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('Esc cancela sem confirmar e devolve o foco ao gatilho', async () => {
    const confirm = vi.fn(ok);
    await renderAction({ confirm });
    const trigger = page.getByRole('button', { name: 'Remover infraestrutura' });

    await trigger.click();
    await expect.element(domainField()).toBeVisible();
    await domainField().click();
    await userEvent.keyboard(DOMAIN);
    await userEvent.keyboard('{Escape}');

    await expect.element(dialog()).not.toBeInTheDocument();
    await expect.element(trigger).toHaveFocus();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('erro ao preparar: a mensagem no Alert e "Remover" desativado', async () => {
    await renderAction({
      read: () => Promise.resolve({ status: 'falhou', message: 'token de infra expirado' }),
    });

    await page.getByRole('button', { name: 'Remover infraestrutura' }).click();

    await expect.element(dialog().getByRole('alert')).toHaveTextContent('token de infra expirado');
    await expect.element(removeButton()).toBeDisabled();
  });
});
