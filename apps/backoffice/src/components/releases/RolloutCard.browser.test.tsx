import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { appElementWarnings, appRoot, expectFocusTrapped } from '../../../test/browser/dialog.ts';
import { renderInApp } from '../../../test/browser/render.tsx';

import { RolloutButton } from './RolloutCard.tsx';

// "Atualizar todos os sites" em Chromium (#703): abre pelo teclado com o foco preso no
// alertdialog e a versão de destino; Esc e o sucesso devolvem o foco ao botão; a recusa fica no
// diálogo. Sem axe: Dialog e ConfirmDialog são cobertos como componentes de base (ADR 0020).

const TRIGGER = 'Atualizar todos os sites';
const NAME = 'Atualizar todos os sites para a 1.5.0?';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Atualizar todos os sites no navegador', () => {
  it('abre pelo teclado com o destino e o foco preso; Esc devolve o foco', async () => {
    const warnings = appElementWarnings();
    const screen = await renderInApp(
      <RolloutButton target="1.5.0" running={false} action={vi.fn()} />,
    );
    const trigger = screen.getByRole('button', { name: TRIGGER });

    (trigger.element() as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    const dialog = page.getByRole('alertdialog', { name: NAME });
    await expect.element(dialog.getByRole('heading', { name: NAME })).toBeVisible();
    expect(appRoot().inert).toBe(true);
    await expectFocusTrapped(dialog);

    await userEvent.keyboard('{Escape}');
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(trigger).toHaveFocus();
    expect(appRoot().inert).toBe(false);
    expect(warnings()).toEqual([]);
  });

  it('confirmar inicia, fecha o diálogo, devolve o foco e mostra o toast', async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, message: 'Atualização iniciada.' });
    const screen = await renderInApp(
      <RolloutButton target="1.5.0" running={false} action={action} />,
    );
    const trigger = screen.getByRole('button', { name: TRIGGER });

    await trigger.click();
    const dialog = page.getByRole('alertdialog', { name: NAME });
    await dialog.getByRole('button', { name: 'Atualizar', exact: true }).click();

    await expect.element(dialog).not.toBeInTheDocument();
    expect(action).toHaveBeenCalledTimes(1);
    await expect.element(trigger).toHaveFocus();
    await expect.element(page.getByText('Atualização iniciada.')).toBeVisible();
  });

  it('a recusa do domínio fica no diálogo, que segue aberto', async () => {
    const action = vi.fn().mockResolvedValue({ ok: false, message: 'Já existe uma em andamento' });
    const screen = await renderInApp(
      <RolloutButton target="1.5.0" running={false} action={action} />,
    );

    await screen.getByRole('button', { name: TRIGGER }).click();
    const dialog = page.getByRole('alertdialog', { name: NAME });
    await dialog.getByRole('button', { name: 'Atualizar', exact: true }).click();

    await expect.element(dialog.getByRole('alert')).toHaveTextContent('Já existe uma em andamento');
    await expect.element(dialog).toBeVisible();
  });
});
