import { useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { appElementWarnings, appRoot, expectFocusTrapped } from '../../../test/browser/dialog.ts';
import { renderInApp } from '../../../test/browser/render.tsx';
import { Button } from '@/components/ui/Button';

import { RebuildReleaseDialog, type RebuildRelease } from './RebuildReleaseDialog.tsx';

// Reconstruir na release em Chromium (#515): foco preso no alertdialog, o foco volta ao
// gatilho ao fechar (Esc, Cancelar e confirmar).

const RELEASES: RebuildRelease[] = [
  { tag: '1.3.0', imageStatus: 'ausente' },
  { tag: '1.2.0', imageStatus: 'disponivel' },
];
const NAME = 'Reconstruir o site numa release?';

/** O diálogo aberto por um botão, como o "Mais ações" faz na página do site (#595). */
function Rebuild({ onConfirm }: { onConfirm: (tag: string) => void }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button ref={trigger} type="button" size="sm" onClick={() => setOpen(true)}>
        Reconstruir na release
      </Button>
      <RebuildReleaseDialog
        current="1.2.0"
        paused
        releases={RELEASES}
        isOpen={open}
        onCancel={() => setOpen(false)}
        onConfirm={(tag) => {
          setOpen(false);
          onConfirm(tag);
        }}
        onAfterClose={() => trigger.current?.focus()}
      />
    </>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Reconstruir na release no navegador', () => {
  it('foco preso; Esc e Cancelar fecham e devolvem o foco ao gatilho', async () => {
    const warnings = appElementWarnings();
    const screen = await renderInApp(<Rebuild onConfirm={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Reconstruir na release' });

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

  it('escolher outra release e confirmar chama o onConfirm e devolve o foco ao gatilho', async () => {
    const action = vi.fn();
    const screen = await renderInApp(<Rebuild onConfirm={action} />);
    const trigger = screen.getByRole('button', { name: 'Reconstruir na release' });

    await trigger.click();
    const dialog = page.getByRole('alertdialog', { name: NAME });
    await dialog.getByRole('combobox', { name: 'Release' }).click();
    await page.getByRole('option', { name: '1.3.0' }).click();
    await expect
      .element(
        dialog.getByText(
          'O site passa a usar a imagem site-builder:1.3.0, o build entra na fila já e o site no ar muda. O site sai da pausa.',
        ),
      )
      .toBeVisible();
    await dialog.getByRole('button', { name: 'Reconstruir', exact: true }).click();

    await expect.element(dialog).not.toBeInTheDocument();
    expect(action).toHaveBeenCalledWith('1.3.0');
    await expect.element(trigger).toHaveFocus();
  });
});
