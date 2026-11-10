// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import Modal from 'react-modal';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionResult } from '@/components/shared/actionResult.ts';
import { toast, ToastProvider } from '@/components/ui/toast';
import { APP_ELEMENT_ID } from '@/components/ui/utils/modalApp';
import type { RollbackVersion } from '@/domain/builds/builds.ts';

import { RollbackDialog } from './RollbackDialog.tsx';

// Reverter (#514): o Select das versões revertíveis (a página já entrega sem a ativa) começando
// na mais recente, a action com a versão escolhida e o retorno padrão (sucesso no toast, recusa
// no Alert). Foco e axe no navegador, em `RollbackDialog.browser.test.tsx`.

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

let app: HTMLElement;

function Rollback({
  action,
  versions = VERSIONS,
}: {
  action: (versionId: string) => Promise<ActionResult>;
  versions?: readonly RollbackVersion[];
}) {
  return (
    <>
      <RollbackDialog versions={versions} timeZone="America/Sao_Paulo" action={action} />
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
  await userEvent.click(screen.getByRole('button', { name: 'Reverter' }));
  return screen.getByRole('alertdialog', { name: NAME });
}

describe('reverter', () => {
  it('começa na versão mais recente e chama a action com ela; o sucesso vai ao toast', async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, message: 'Rollback enfileirado.' });
    render(<Rollback action={action} />, { container: app });

    const dialog = await openDialog();
    expect(dialog.textContent).toContain('volta para a versão 20261010T120000Z-bbbbbbbb');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reverter' }));

    await waitFor(() => expect(action).toHaveBeenCalledWith('20261010T120000Z-bbbbbbbb'));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Rollback enfileirado.'),
    );
    expect(screen.getByRole('alert').textContent).toBe('');
  });

  it('lista só as versões recebidas, com data, release e versão; a escolhida vai à action', async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, message: 'ok' });
    render(<Rollback action={action} />, { container: app });

    const dialog = await openDialog();
    await userEvent.click(screen.getByRole('combobox', { name: 'Versão' }));
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      '10/10/2026, 09:00 BRT · 1.2.0 · 20261010T120000Z-bbbbbbbb',
      '01/10/2026, 09:00 BRT · 1.1.0 · 20261001T120000Z-abcdef12',
    ]);
    await userEvent.click(screen.getByText(/20261001T120000Z-abcdef12/));
    expect(dialog.textContent).toContain('volta para a versão 20261001T120000Z-abcdef12');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reverter' }));

    await waitFor(() => expect(action).toHaveBeenCalledWith('20261001T120000Z-abcdef12'));
  });

  it('sem versão anterior, o Reverter do diálogo fica desabilitado', async () => {
    const action = vi.fn();
    render(<Rollback action={action} versions={[]} />, { container: app });

    const dialog = await openDialog();
    expect(dialog.textContent).toContain('Nenhuma versão anterior publicada');
    expect(within(dialog).getByRole('button', { name: 'Reverter' }).hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('cancelar fecha sem chamar a action', async () => {
    const action = vi.fn();
    render(<Rollback action={action} />, { container: app });

    await openDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(action).not.toHaveBeenCalled();
  });

  it('a recusa do domínio vai ao Alert, sem toast de sucesso', async () => {
    const action = vi.fn().mockResolvedValue({ ok: false, message: 'A versão já está no ar' });
    render(<Rollback action={action} />, { container: app });

    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reverter' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('A versão já está no ar'),
    );
    expect(screen.queryByRole('status')?.textContent ?? '').toBe('');
  });
});
