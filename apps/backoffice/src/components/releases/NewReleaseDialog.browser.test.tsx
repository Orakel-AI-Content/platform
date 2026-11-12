import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { appElementWarnings, appRoot, expectFocusTrapped } from '../../../test/browser/dialog.ts';
import { renderInApp } from '../../../test/browser/render.tsx';

import { NewReleaseDialog, type ReleaseProposals } from './NewReleaseDialog.tsx';

// "Gerar nova versão" em Chromium (#664): abre pelo teclado com o foco preso, o tipo se escolhe
// pelo teclado, sem campo de número; o sucesso fecha e devolve o foco ao botão, a recusa fica
// no diálogo. Sem axe: Dialog e Segment são cobertos como componentes de base (ADR 0020).

const PROPOSALS: ReleaseProposals = { patch: '1.2.4', minor: '1.3.0', major: '2.0.0' };
const NAME = 'Gerar nova versão';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Gerar nova versão no navegador', () => {
  it('abre pelo teclado com correção escolhida e o foco preso; Esc devolve o foco', async () => {
    const warnings = appElementWarnings();
    const screen = await renderInApp(<NewReleaseDialog proposals={PROPOSALS} action={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: NAME });

    (trigger.element() as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    const dialog = page.getByRole('dialog', { name: NAME });
    await expect.element(dialog).toBeVisible();
    expect(appRoot().inert).toBe(true);
    await expect
      .element(dialog.getByRole('button', { name: 'Correção 1.2.4' }))
      .toHaveAttribute('aria-pressed', 'true');
    await expect
      .element(dialog.getByRole('button', { name: 'Melhoria 1.3.0' }))
      .toHaveAttribute('aria-pressed', 'false');
    await expect
      .element(dialog.getByRole('button', { name: 'Mudança grande 2.0.0' }))
      .toBeVisible();
    expect(dialog.element().querySelector('input')).toBeNull();
    await expectFocusTrapped(dialog);

    await userEvent.keyboard('{Escape}');
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(trigger).toHaveFocus();
    expect(appRoot().inert).toBe(false);
    expect(warnings()).toEqual([]);
  });

  it('escolher melhoria pelo teclado e gerar fecha o diálogo e devolve o foco', async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, message: 'Versão 1.3.0 pedida.' });
    const screen = await renderInApp(<NewReleaseDialog proposals={PROPOSALS} action={action} />);
    const trigger = screen.getByRole('button', { name: NAME });

    await trigger.click();
    const dialog = page.getByRole('dialog', { name: NAME });
    const minor = dialog.getByRole('button', { name: 'Melhoria 1.3.0' });
    (minor.element() as HTMLElement).focus();
    await userEvent.keyboard(' ');
    await expect.element(minor).toHaveAttribute('aria-pressed', 'true');
    await expect
      .element(dialog.getByText('A versão 1.3.0 começa a ser gerada agora.'))
      .toBeVisible();
    await dialog.getByRole('button', { name: 'Gerar', exact: true }).click();

    await expect.element(dialog).not.toBeInTheDocument();
    expect(action).toHaveBeenCalledWith('minor');
    await expect.element(trigger).toHaveFocus();
    await expect.element(page.getByText('Versão 1.3.0 pedida.')).toBeVisible();
  });

  it('a recusa do domínio fica no diálogo, que segue aberto', async () => {
    const action = vi.fn().mockResolvedValue({ ok: false, message: 'Peça de novo' });
    const screen = await renderInApp(<NewReleaseDialog proposals={PROPOSALS} action={action} />);

    await screen.getByRole('button', { name: NAME }).click();
    const dialog = page.getByRole('dialog', { name: NAME });
    await dialog.getByRole('button', { name: 'Gerar', exact: true }).click();

    await expect.element(dialog.getByRole('alert')).toHaveTextContent('Peça de novo');
    expect(action).toHaveBeenCalledWith('patch');
    await expect.element(dialog).toBeVisible();
  });
});
