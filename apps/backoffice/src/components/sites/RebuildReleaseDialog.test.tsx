// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import Modal from 'react-modal';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionResult } from '@/components/shared/actionResult.ts';
import { toast, ToastProvider } from '@/components/ui/toast';
import { APP_ELEMENT_ID } from '@/components/ui/utils/modalApp';

import { RebuildReleaseDialog, type RebuildRelease } from './RebuildReleaseDialog.tsx';

// Reconstruir na release (#515): o Select das releases registradas começando na atual (ou na
// mais recente), a action com a tag escolhida e o retorno padrão (sucesso no toast, recusa no
// Alert). Com a imagem da release escolhida ausente, o Alert de aviso sem travar o confirmar
// (#574). Foco e axe no navegador, em `RebuildReleaseDialog.browser.test.tsx`.

const RELEASES: RebuildRelease[] = [
  { tag: '1.3.0', imageStatus: 'disponivel' },
  { tag: '1.2.0', imageStatus: 'disponivel' },
  { tag: '1.1.0', imageStatus: 'ausente' },
];
const MISSING = /A imagem site-builder:1\.1\.0 não estava no host/;
const NAME = 'Reconstruir o site numa release?';

let app: HTMLElement;

function Rebuild({
  action,
  current = '1.2.0',
  paused = false,
  releases = RELEASES,
}: {
  action: (tag: string) => Promise<ActionResult>;
  current?: string | null;
  paused?: boolean;
  releases?: readonly RebuildRelease[];
}) {
  return (
    <>
      <RebuildReleaseDialog current={current} paused={paused} releases={releases} action={action} />
      <ToastProvider />
    </>
  );
}

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
  act(() => toast.removeAll());
  cleanup();
  await waitFor(() => expect(document.querySelector('.dialog-portal')).toBeNull());
  app.remove();
});

async function openDialog() {
  await userEvent.click(screen.getByRole('button', { name: 'Reconstruir na release' }));
  return screen.getByRole('alertdialog', { name: NAME });
}

describe('reconstruir na release', () => {
  it('começa na release atual e chama a action com ela; o sucesso vai ao toast', async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, message: 'Build enfileirado.' });
    render(<Rebuild action={action} />, { container: app });

    const dialog = await openDialog();
    expect(dialog.textContent).toContain('site-builder:1.2.0');
    expect(dialog.textContent).not.toContain('sai da pausa');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reconstruir' }));

    await waitFor(() => expect(action).toHaveBeenCalledWith('1.2.0'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Build enfileirado.'));
    expect(screen.getByRole('alert').textContent).toBe('');
  });

  it('a release escolhida no Select vai à action', async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, message: 'ok' });
    render(<Rebuild action={action} />, { container: app });

    const dialog = await openDialog();
    await userEvent.click(screen.getByRole('combobox', { name: 'Release' }));
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      '1.3.0',
      '1.2.0 (atual)',
      '1.1.0',
    ]);
    await userEvent.click(screen.getByText('1.3.0'));
    expect(dialog.textContent).toContain('site-builder:1.3.0');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reconstruir' }));

    await waitFor(() => expect(action).toHaveBeenCalledWith('1.3.0'));
  });

  it('sem release atual registrada, começa na mais recente; pausado, avisa que sai da pausa', async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, message: 'ok' });
    render(<Rebuild action={action} current={null} paused />, { container: app });

    const dialog = await openDialog();
    expect(dialog.textContent).toContain('site-builder:1.3.0');
    expect(dialog.textContent).toContain('O site sai da pausa.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reconstruir' }));

    await waitFor(() => expect(action).toHaveBeenCalledWith('1.3.0'));
  });

  it('sem nenhuma release registrada, o Reconstruir fica desabilitado', async () => {
    const action = vi.fn();
    render(<Rebuild action={action} current={null} releases={[]} />, { container: app });

    const dialog = await openDialog();
    expect(dialog.textContent).toContain('Nenhuma release registrada');
    expect(
      within(dialog).getByRole('button', { name: 'Reconstruir' }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('com a imagem da release escolhida ausente, avisa e o Reconstruir continua habilitado', async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, message: 'ok' });
    render(<Rebuild action={action} />, { container: app });

    const dialog = await openDialog();
    expect(within(dialog).queryByText(MISSING)).toBeNull();
    await userEvent.click(screen.getByRole('combobox', { name: 'Release' }));
    await userEvent.click(screen.getByText('1.1.0'));

    expect(within(dialog).getByText(MISSING)).toBeTruthy();
    const confirm = within(dialog).getByRole('button', { name: 'Reconstruir' });
    expect(confirm.hasAttribute('disabled')).toBe(false);
    await userEvent.click(confirm);

    await waitFor(() => expect(action).toHaveBeenCalledWith('1.1.0'));
  });

  it('imagem não conferida não gera aviso', async () => {
    render(
      <Rebuild action={vi.fn()} current={null} releases={[{ tag: '2.0.0', imageStatus: null }]} />,
      { container: app },
    );

    const dialog = await openDialog();
    expect(dialog.textContent).toContain('site-builder:2.0.0');
    expect(dialog.textContent).not.toContain('não estava no host');
  });

  it('cancelar fecha sem chamar a action', async () => {
    const action = vi.fn();
    render(<Rebuild action={action} />, { container: app });

    await openDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(action).not.toHaveBeenCalled();
  });

  it('a recusa do domínio vai ao Alert, sem toast de sucesso', async () => {
    const action = vi.fn().mockResolvedValue({
      ok: false,
      message: 'A release 1.2.0 não está registrada',
    });
    render(<Rebuild action={action} />, { container: app });

    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reconstruir' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('A release 1.2.0 não está registrada'),
    );
    expect(screen.queryByRole('status')?.textContent ?? '').toBe('');
  });
});
