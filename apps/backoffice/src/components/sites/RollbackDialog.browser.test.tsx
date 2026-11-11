import { useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { appElementWarnings, appRoot, expectFocusTrapped } from '../../../test/browser/dialog.ts';
import { renderInApp } from '../../../test/browser/render.tsx';
import { Button } from '@/components/ui/Button';
import type { RollbackVersion } from '@/domain/builds/builds.ts';

import { RollbackDialog } from './RollbackDialog.tsx';

// Reverter em Chromium (#514): foco preso no alertdialog, o foco volta ao gatilho ao fechar
// (Esc, Cancelar e confirmar).

const VERSIONS: RollbackVersion[] = [
  {
    versionId: '20261010T120000Z-bbbbbbbb',
    release: '1.2.0',
    pages: 12,
    finishedAt: new Date('2026-10-10T12:00:00Z'),
  },
  {
    versionId: '20261001T120000Z-abcdef12',
    release: '1.1.0',
    pages: 10,
    finishedAt: new Date('2026-10-01T12:00:00Z'),
  },
];
const NAME = 'Reverter o site para uma versão anterior?';

/** O diálogo aberto por um botão, como o "Mais ações" faz na página do site (#595). */
function Rollback({ onConfirm }: { onConfirm: (versionId: string) => void }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button ref={trigger} type="button" size="sm" onClick={() => setOpen(true)}>
        Reverter
      </Button>
      <RollbackDialog
        versions={VERSIONS}
        timeZone="America/Sao_Paulo"
        isOpen={open}
        onCancel={() => setOpen(false)}
        onConfirm={(versionId) => {
          setOpen(false);
          onConfirm(versionId);
        }}
        onAfterClose={() => trigger.current?.focus()}
      />
    </>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Reverter no navegador', () => {
  it('foco preso; Esc e Cancelar fecham e devolvem o foco ao gatilho', async () => {
    const warnings = appElementWarnings();
    const screen = await renderInApp(<Rollback onConfirm={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Reverter' });

    (trigger.element() as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    const dialog = page.getByRole('alertdialog', { name: NAME });
    await expect.element(dialog.getByRole('heading', { name: NAME })).toBeVisible();
    expect(appRoot().inert).toBe(true);
    await expectFocusTrapped(dialog);

    await userEvent.keyboard('{Escape}');
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(trigger).toHaveFocus();

    await userEvent.keyboard('{Enter}');
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(trigger).toHaveFocus();
    expect(appRoot().inert).toBe(false);
    expect(warnings()).toEqual([]);
  });

  it('escolher outra versão e confirmar chama o onConfirm e devolve o foco ao gatilho', async () => {
    const action = vi.fn();
    const screen = await renderInApp(<Rollback onConfirm={action} />);
    const trigger = screen.getByRole('button', { name: 'Reverter' });

    await trigger.click();
    const dialog = page.getByRole('alertdialog', { name: NAME });
    await dialog.getByRole('combobox', { name: 'Versão' }).click();
    await page.getByRole('option', { name: /20261001T120000Z-abcdef12/ }).click();
    await expect
      .element(dialog.getByText(/volta para a versão 20261001T120000Z-abcdef12/))
      .toBeVisible();
    await dialog.getByRole('button', { name: 'Reverter', exact: true }).click();

    await expect.element(dialog).not.toBeInTheDocument();
    expect(action).toHaveBeenCalledWith('20261001T120000Z-abcdef12');
    await expect.element(trigger).toHaveFocus();
  });
});
